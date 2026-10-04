// Public registration page /r/<slug> (docs/registration-slice3-spec.md D),
// server side: which event a slug opens, what the form shows, and what a
// valid submission creates -- a Family flagged "Ke kontrole", its people and
// their PENDING registrations. Possible duplicates are never merged here (the
// admin links/merges them on the Lidé page); auto-accept per event (E) runs
// afterwards in the route.
import { prisma } from "@/lib/prisma";
import { createRegistration, oddilField, visibleTemplates } from "@/lib/portal-server";
import { readPriceRules } from "@/lib/price-rules";
import { fullNameFrom } from "@/lib/participant-name";
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

/** What the form asks: org fields a parent may see in the portal (same rule), with "required" marks; price rules + the Oddíl field. */
export async function publicFormContext(event: PublicEvent) {
  const rules = readPriceRules(event.priceRules);
  const fields: FormField[] = (await visibleTemplates()).map((t) => ({ key: t.key, label: t.label, fieldType: t.fieldType, options: t.options, required: t.requiredInRegistration }));
  return { fields, rules, oddil: await oddilField(event.id, rules) };
}

/** A valid submission -> Family (needsReview) + people + pending participants. Returns the participant ids. */
export async function createPublicRegistration(event: PublicEvent, data: CleanSubmission): Promise<string[]> {
  const first = data.persons[0];
  const family = await prisma.family.create({ data: { name: first.lastName || first.firstName, needsReview: true } });
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
        fieldValues: p.values,
        guardians: { create: p.guardians.map((g) => ({ ...g, receivesCommunications: true })) },
      },
      include: { guardians: true },
    });
    ids.push((await createRegistration(child, event.id, { note: data.note, priceCategory: p.category })).id);
  }
  return ids;
}
