// Child profiles (registration & membership, docs/registration-membership.md).
// A Child is one kid across all events; Participant.childId links an event's
// row to it. Everything here is opt-in: nothing reads childId unless the event
// has registrationConnected on, so unconnected events behave exactly as before.
// Profile editing + push to events: src/lib/child-profile.ts.
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";
import { participantDisplayName } from "@/lib/participant-name";

/** Match key: name without diacritics/case/extra spaces + birth date. Null = can't match safely. */
export function childKey(name: string, dateOfBirth: Date | null): string | null {
  const n = name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!n || !dateOfBirth) return null;
  return `${n}|${dateOfBirth.toISOString().slice(0, 10)}`;
}

/** Name without diacritics/case -- groups possible duplicates (same name, different/missing birth date). */
export function nameKey(name: string): string {
  return childKey(name, new Date(0))!.split("|")[0];
}

/**
 * Links every not-yet-linked participant matching `where` to a Child with the
 * same name + birth date, creating the Child when none exists. Participants
 * without a birth date are left unlinked (never guessed) -- the Děti page
 * lists them for manual linking.
 */
// ponytail: no DB constraint on the match key -- two links running at the same
// instant could create a duplicate Child; the Děti page's merge fixes that.
export async function linkChildren(where: Prisma.ParticipantWhereInput): Promise<{ linked: number; created: number }> {
  const participants = await prisma.participant.findMany({
    where: { ...where, childId: null, dateOfBirth: { not: null } },
    select: { id: true, name: true, firstName: true, lastName: true, dateOfBirth: true },
  });
  if (participants.length === 0) return { linked: 0, created: 0 };

  const children = await prisma.child.findMany({ select: { id: true, name: true, dateOfBirth: true } });
  const byKey = new Map<string, string>();
  for (const c of children) {
    const k = childKey(c.name, c.dateOfBirth);
    if (k && !byKey.has(k)) byKey.set(k, c.id);
  }

  const groups = new Map<string, typeof participants>();
  for (const p of participants) {
    const k = childKey(participantDisplayName(p), p.dateOfBirth);
    if (k) groups.set(k, [...(groups.get(k) ?? []), p]);
  }

  let linked = 0;
  let created = 0;
  for (const [k, ps] of groups) {
    let childId = byKey.get(k);
    const isNew = !childId;
    if (!childId) {
      // Prefer a row that has the first/last split for the profile's own name.
      const src = ps.find((p) => p.lastName) ?? ps[0];
      const child = await prisma.child.create({
        data: { name: participantDisplayName(src), firstName: src.firstName, lastName: src.lastName, dateOfBirth: src.dateOfBirth },
      });
      childId = child.id;
      created++;
    }
    const res = await prisma.participant.updateMany({ where: { id: { in: ps.map((p) => p.id) }, childId: null }, data: { childId } });
    linked += res.count;
    // A new child's profile starts as a copy of its latest participation.
    if (isNew) await copyProfileFromLatest(childId);
  }
  return { linked, created };
}

/**
 * Fills an EMPTY profile (no field values, no guardians) once from the child's
 * most recent participation (latest event start): its customFieldValues for the
 * org-wide field keys + its guardians. Called when linking creates a Child and
 * by the Děti page's "Doplnit profily z poslední akce". Returns whether it filled.
 */
export async function copyProfileFromLatest(childId: string): Promise<boolean> {
  const [child, latest, templates] = await Promise.all([
    prisma.child.findUnique({ where: { id: childId }, select: { fieldValues: true, _count: { select: { guardians: true } } } }),
    prisma.participant.findFirst({
      where: { childId },
      orderBy: [{ event: { startDate: "desc" } }, { createdAt: "desc" }],
      include: { guardians: true },
    }),
    prisma.participantFieldTemplate.findMany({ select: { key: true } }),
  ]);
  if (!child || !latest || child._count.guardians > 0) return false;
  if (child.fieldValues && Object.keys(child.fieldValues as object).length > 0) return false;
  const keys = new Set(templates.map((t) => t.key));
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries((latest.customFieldValues as Record<string, unknown> | null) ?? {})) {
    if (keys.has(k) && typeof v === "string" && v !== "") values[k] = v;
  }
  await prisma.$transaction([
    prisma.child.update({ where: { id: childId }, data: { fieldValues: values } }),
    prisma.childGuardian.createMany({
      data: latest.guardians.map((g) => ({
        childId,
        name: g.name,
        email: g.email,
        relationship: g.relationship,
        phone: g.phone,
        receivesCommunications: g.receivesCommunications,
      })),
    }),
  ]);
  return true;
}

/** Auto-link after participants were added -- in connected events and always in a membership year (it's the module's own event). */
export async function linkChildrenIfConnected(eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { registrationConnected: true, kind: true } });
  if (event?.registrationConnected || event?.kind === "membership") await linkChildren({ eventId });
}

/**
 * Child ids with an ACCEPTED registration in the membership event for this
 * event's start year. Undefined = the event isn't connected (or is itself the
 * membership event): pricing then uses only the manual membership field.
 */
export async function memberChildIds(eventId: string): Promise<Set<string> | undefined> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { kind: true, registrationConnected: true, startDate: true },
  });
  if (!event || event.kind !== "event" || !event.registrationConnected) return undefined;
  const rows = await prisma.participant.findMany({
    where: {
      childId: { not: null },
      active: true,
      registrationStatus: "accepted",
      event: { kind: "membership", membershipYear: event.startDate.getUTCFullYear() },
    },
    select: { childId: true },
  });
  return new Set(rows.map((r) => r.childId!));
}

/** The event with its confirmed members attached, for isMember() in document-variables.ts. */
export async function withMembers<E extends { id: string }>(event: E): Promise<E & { memberChildIds?: Set<string> }> {
  return { ...event, memberChildIds: await memberChildIds(event.id) };
}
