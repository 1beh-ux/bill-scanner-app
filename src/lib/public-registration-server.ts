// Public registration page /r/<slug> (docs/registration-slice3-spec.md D),
// server side: which event a slug opens, what the form shows, and what a
// valid submission creates -- a Family flagged "Ke kontrole", its people and
// their PENDING registrations. Possible duplicates are never merged here (the
// admin links/merges them on the Lidé page); auto-accept per event (E) runs
// afterwards in the route.
import { prisma } from "@/lib/prisma";
import { createRegistration, oddilField, requiredEventFields, templateRules, visibleTemplates } from "@/lib/portal-server";
import { askedFields } from "@/lib/registration-fields";
import { readPriceRules } from "@/lib/price-rules";
import { fullNameFrom } from "@/lib/participant-name";
import { newPortalToken } from "@/lib/portal-gate";
import type { CleanSubmission, FormField } from "@/lib/public-registration";

const startOfToday = () => new Date(new Date().toISOString().slice(0, 10));

/** The event a public slug opens: switched on, active, connected or a membership year, before its deadline. Null = 404. */
export async function publicEvent(slug: string) {
  if (!slug || slug.length > 60) return null;
  return prisma.event.findFirst({
    where: {
      publicSlug: slug,
      publicRegistration: true,
      status: "active",
      OR: [{ registrationConnected: true }, { kind: "membership" }],
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
  const [templates, eventFields, tplRules] = await Promise.all([visibleTemplates(), requiredEventFields([event.id]), templateRules()]);
  const asked = askedFields(eventFields, tplRules);
  const askedKeys = new Set(asked.filter((f) => f.source === "profile").map((f) => f.key));
  const fields: FormField[] = [
    ...templates
      .filter((t) => t.level === "basic" || askedKeys.has(t.key))
      .map((t) => ({ key: t.key, label: t.label, fieldType: t.fieldType, options: t.options, required: t.requiredInRegistration || askedKeys.has(t.key), audience: t.audience })),
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
