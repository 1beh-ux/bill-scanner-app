// Public registration page /r/<slug> (docs/registration-slice3-spec.md D),
// server side: which event a slug opens, what the form shows, and what a
// valid submission creates -- a Family flagged "Ke kontrole", its people and
// their PENDING registrations. Possible duplicates are never merged here (the
// admin links/merges them on the Lidé page); auto-accept per event (E) runs
// afterwards in the route.
import { prisma } from "@/lib/prisma";
import { createRegistration, oddilField, requiredEventFields, templateRules, visibleTemplates } from "@/lib/portal-server";
import { askedFields, askedNow } from "@/lib/registration-fields";
import { readPriceRules } from "@/lib/price-rules";
import { fullNameFrom } from "@/lib/participant-name";
import { newPortalToken } from "@/lib/portal-gate";
import type { CleanSubmission, FormField } from "@/lib/public-registration";
import { readProfileSections, sectionOf } from "@/lib/portal-rules";
import { linkChildren } from "@/lib/children";

const startOfToday = () => new Date(new Date().toISOString().slice(0, 10));

/** The event a public slug opens: switched on, active, connected / a membership year / a public event, before its deadline. Null = 404. */
export async function publicEvent(slug: string) {
  if (!slug || slug.length > 60) return null;
  return prisma.event.findFirst({
    where: {
      publicSlug: slug,
      publicRegistration: true,
      status: "active",
      // public_event: the ticket form instead of the family form (src/lib/tickets-server.ts).
      OR: [{ registrationConnected: true }, { kind: "membership" }, { kind: "public_event" }],
      AND: [{ OR: [{ registrationDeadline: null }, { registrationDeadline: { gte: startOfToday() } }] }],
    },
  });
}
export type PublicEvent = NonNullable<Awaited<ReturnType<typeof publicEvent>>>;

/**
 * What the form asks: org fields a parent may see in the portal (same rule) --
 * the basic ones plus the detailed ones this event requires (slice 5 #3) --
 * with "required" marks, then the event's own questions; price rules + the Oddíl field.
 */
export async function publicFormContext(event: PublicEvent) {
  const rules = readPriceRules(event.priceRules);
  const [templates, eventFields, tplRules, org] = await Promise.all([
    visibleTemplates(event.organizationId),
    requiredEventFields([event.id]),
    templateRules(event.organizationId),
    prisma.organization.findUniqueOrThrow({ where: { id: event.organizationId }, select: { portalProfileSections: true } }),
  ]);
  // Headings: the profile parts (only the organization's own ones -- basic / detailed stay unnamed).
  const sections = readProfileSections(org.portalProfileSections);
  const groupOf = (t: { profileSection: string | null; level: "basic" | "detailed" }) => sections.find((s) => s.key === sectionOf(t, sections))?.label;
  // Two-step events: the detailed fields and the event's questions come after acceptance.
  const asked = askedNow(askedFields(eventFields, tplRules), event.detailsAfterAcceptance);
  const askedKeys = new Set(asked.filter((f) => f.source === "profile").map((f) => f.key));
  const fields: FormField[] = [
    ...templates
      .filter((t) => t.level === "basic" || askedKeys.has(t.key))
      .map((t) => ({ key: t.key, label: t.label, fieldType: t.fieldType, options: t.options, adultOptions: t.adultOptions ?? undefined, group: groupOf(t), required: t.requiredInRegistration || askedKeys.has(t.key), audience: t.audience })),
    ...asked.filter((f) => f.source === "event").map((f) => ({ key: f.key, label: f.label, fieldType: f.fieldType, options: f.options, required: true, eventOnly: true })),
  ];
  return { fields, rules, oddil: await oddilField(event.id, rules) };
}

/**
 * A valid submission -> Family (needsReview) + people + pending participants.
 * Returns the participant ids, and the family's new portal token when the
 * event auto-sends (slice 4 #10: the confirmation screen then shows the link).
 */
export async function createPublicRegistration(event: PublicEvent, data: CleanSubmission, fields: FormField[]): Promise<{ ids: string[]; portalToken: string | null }> {
  // Event questions (slice 5 #3) go onto the registration only, never into the profile.
  const eventOnly = new Set(fields.filter((f) => f.eventOnly).map((f) => f.key));
  // "Jen existující" (peopleLinkMode existing, 2026-10-25): the portal is for members -- a public registration
  // creates only the participant (no person, no family, no portal link); the details come through its own
  // /u link after acceptance ({{details_link}}). Someone already in Členové (name + birth date) is linked.
  // A membership year always creates people: that's how one becomes a member.
  if (event.peopleLinkMode === "existing" && event.kind !== "membership") {
    const keys = new Set((await prisma.eventParticipantField.findMany({ where: { eventId: event.id, active: true, kind: "custom" }, select: { key: true } })).map((f) => f.key));
    const ids: string[] = [];
    for (const p of data.persons) {
      const row = await prisma.participant.create({
        data: {
          eventId: event.id,
          name: fullNameFrom(p.firstName, p.lastName),
          firstName: p.firstName,
          lastName: p.lastName,
          dateOfBirth: new Date(p.birthDate),
          customFieldValues: Object.fromEntries(Object.entries(p.values).filter(([k, v]) => keys.has(k) && v)),
          portalNote: data.note.trim().slice(0, 2000) || null,
          priceCategory: p.category,
          guardians: { create: p.guardians.map((g) => ({ ...g, receivesCommunications: true })) },
        },
        select: { id: true },
      });
      ids.push(row.id);
    }
    await linkChildren({ id: { in: ids } });
    return { ids, portalToken: null };
  }
  const first = data.persons[0];
  const portalToken = event.autoAccept === "accept_send" ? newPortalToken() : null;
  const family = await prisma.family.create({ data: { name: first.lastName || first.firstName, needsReview: true, portalToken, organizationId: event.organizationId } });
  const ids: string[] = [];
  for (const p of data.persons) {
    const child = await prisma.child.create({
      data: {
        name: fullNameFrom(p.firstName, p.lastName),
        firstName: p.firstName,
        lastName: p.lastName,
        dateOfBirth: new Date(p.birthDate),
        isAdult: p.isAdult,
        familyId: family.id,
        organizationId: event.organizationId,
        fieldValues: Object.fromEntries(Object.entries(p.values).filter(([k]) => !eventOnly.has(k))),
        guardians: { create: p.guardians.map((g) => ({ ...g, receivesCommunications: true })) },
      },
      include: { guardians: true },
    });
    const answers = Object.fromEntries(Object.entries(p.values).filter(([k]) => eventOnly.has(k)));
    ids.push((await createRegistration(child, event.id, { note: data.note, priceCategory: p.category, values: answers })).id);
  }
  return { ids, portalToken };
}
