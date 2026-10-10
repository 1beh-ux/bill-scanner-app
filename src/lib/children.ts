// Child profiles (registration & membership, docs/registration-membership.md).
// A Child is one kid across all events; Participant.childId links an event's
// row to it. Everything here is opt-in: nothing reads childId unless the event
// has registrationConnected on, so unconnected events behave exactly as before.
// Profile editing + push to events: src/lib/child-profile.ts.
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";
import { participantDisplayName } from "@/lib/participant-name";
import { readPriceRules } from "@/lib/price-rules";
import type { PriceContext } from "@/lib/document-variables";

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

// createMissing false: may only link to an existing child (Event.peopleLinkMode
// `existing`, slice 8 #3); unlinked: the event is "Odpojit od Lidé" -- never linked.
type LinkCandidate = { id: string; eventId: string; name: string; dateOfBirth: Date | null; createMissing?: boolean; unlinked?: boolean };
type LinkChild = { id: string; name: string; dateOfBirth: Date | null; eventIds: string[] };

/**
 * Which participants link to which child (null = create one), by name + birth
 * date. Ambiguous matches are left out -- they go to the Děti page for manual
 * linking, since two different kids can share a name and birth date:
 * - two existing children with the same key,
 * - two candidates with the same key in the same event (they're two kids),
 * - a candidate in an event the matching child is already in.
 * Candidates of unlinked events are skipped; a new child is created only when
 * some candidate of the group may create one (the others then link to it too).
 */
export function planLinks(participants: LinkCandidate[], children: LinkChild[]): { childId: string | null; participantIds: string[] }[] {
  const byKey = new Map<string, LinkChild | "ambiguous">();
  for (const c of children) {
    const k = childKey(c.name, c.dateOfBirth);
    if (k) byKey.set(k, byKey.has(k) ? "ambiguous" : c);
  }
  const groups = new Map<string, LinkCandidate[]>();
  for (const p of participants) {
    if (p.unlinked) continue;
    const k = childKey(p.name, p.dateOfBirth);
    if (k) groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const out: { childId: string | null; participantIds: string[] }[] = [];
  for (const [k, ps] of groups) {
    const child = byKey.get(k);
    if (child === "ambiguous" || (!child && !ps.some((p) => p.createMissing !== false))) continue;
    const eventIds = ps.map((p) => p.eventId);
    if (new Set(eventIds).size !== eventIds.length) continue;
    const ok = child ? ps.filter((p) => !child.eventIds.includes(p.eventId)) : ps;
    if (ok.length > 0) out.push({ childId: child?.id ?? null, participantIds: ok.map((p) => p.id) });
  }
  return out;
}

/**
 * Links every not-yet-linked participant matching `where` to a Child with the
 * same name + birth date, creating the Child when none exists (see planLinks
 * for what's left out as ambiguous). Participants without a birth date are
 * left unlinked (never guessed) -- the Děti page lists them for manual linking.
 * Whether a missing Child may be created is each event's peopleLinkMode
 * (slice 8 #3: `existing` never creates), unless `createMissing` overrides it
 * (the roster's "Propojit s Lidmi"). "Odpojit od Lidé" events are never linked.
 */
// ponytail: no DB constraint on the match key -- two links running at the same
// instant could create a duplicate Child; the Děti page's merge fixes that.
export async function linkChildren(where: Prisma.ParticipantWhereInput, opts: { createMissing?: boolean } = {}): Promise<{ linked: number; created: number }> {
  const participants = await prisma.participant.findMany({
    where: { ...where, childId: null, dateOfBirth: { not: null } },
    select: { id: true, eventId: true, name: true, firstName: true, lastName: true, dateOfBirth: true, event: { select: { peopleUnlinked: true, peopleLinkMode: true, organizationId: true } } },
  });
  if (participants.length === 0) return { linked: 0, created: 0 };

  // Organizations step 2: a participant only ever matches (or creates) a person
  // of its event's organization -- never another organization's same name + birth date.
  const byOrg = new Map<string, typeof participants>();
  for (const p of participants) byOrg.set(p.event.organizationId, [...(byOrg.get(p.event.organizationId) ?? []), p]);

  let linked = 0;
  let created = 0;
  const touched: string[] = [];
  for (const [organizationId, orgParticipants] of byOrg) {
    const children = await prisma.child.findMany({ where: { organizationId }, select: { id: true, name: true, dateOfBirth: true, participants: { select: { eventId: true } } } });
    const plan = planLinks(
      orgParticipants.map((p) => ({ ...p, name: participantDisplayName(p), unlinked: p.event.peopleUnlinked, createMissing: opts.createMissing ?? p.event.peopleLinkMode === "all" })),
      children.map((c) => ({ ...c, eventIds: c.participants.map((x) => x.eventId) }))
    );
    const byId = new Map(orgParticipants.map((p) => [p.id, p]));

    for (const step of plan) {
      let childId = step.childId;
      const isNew = !childId;
      if (!childId) {
        // Prefer a row that has the first/last split for the profile's own name.
        const ps = step.participantIds.map((id) => byId.get(id)!);
        const src = ps.find((p) => p.lastName) ?? ps[0];
        const child = await prisma.child.create({
          data: { name: participantDisplayName(src), firstName: src.firstName, lastName: src.lastName, dateOfBirth: src.dateOfBirth, organizationId },
        });
        childId = child.id;
        created++;
      }
      const res = await prisma.participant.updateMany({ where: { id: { in: step.participantIds }, childId: null }, data: { childId } });
      linked += res.count;
      if (res.count > 0) touched.push(childId);
      // A new child's profile starts as a copy of its latest participation.
      if (isNew) await copyProfileFromLatest(childId);
    }
  }
  if (touched.length > 0) await fillMissingGuardians({ childIds: touched });
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
    // The person's organization's templates.
    prisma.participantFieldTemplate.findMany({ where: { organization: { children: { some: { id: childId } } } }, select: { key: true } }),
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

/**
 * People with NO guardians get them from their most recent participation that
 * has any (copyProfileFromLatest only fills a completely empty profile, from the
 * very latest event even if it had none). Existing guardians are never touched.
 * `childIds` undefined = everyone. Returns how many people got guardians.
 */
/** `scope`: the given people, or every person of an organization (the Lidé page's "Doplnit profily"). */
export async function fillMissingGuardians(scope: { childIds: string[] } | { organizationId: string }): Promise<number> {
  const people = await prisma.child.findMany({
    where: { guardians: { none: {} }, ...("childIds" in scope ? { id: { in: scope.childIds } } : { organizationId: scope.organizationId }) },
    select: {
      id: true,
      participants: {
        where: { guardians: { some: {} } },
        orderBy: [{ event: { startDate: "desc" } }, { createdAt: "desc" }],
        take: 1,
        select: { guardians: true },
      },
    },
  });
  let filled = 0;
  for (const c of people) {
    const source = c.participants[0];
    if (!source) continue;
    await prisma.childGuardian.createMany({
      data: source.guardians.map((g) => ({ childId: c.id, name: g.name, email: g.email, relationship: g.relationship, phone: g.phone, receivesCommunications: g.receivesCommunications })),
    });
    filled++;
  }
  return filled;
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

/**
 * Who is an adult and how many people of each Family are registered (active,
 * pending or accepted) in the event -- what price rules need (slice 3 C).
 * Counted live across the whole event, so a later sibling also lowers the
 * earlier ones' price (retroactively, as decided).
 */
export async function priceContext(eventId: string): Promise<PriceContext> {
  const rows = await prisma.participant.findMany({
    where: { eventId, childId: { not: null } },
    select: { childId: true, active: true, child: { select: { isAdult: true, familyId: true } } },
  });
  const perFamily = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.active && r.child?.familyId) perFamily.set(r.child.familyId, (perFamily.get(r.child.familyId) ?? new Set()).add(r.childId!));
  }
  return {
    adultChildIds: new Set(rows.filter((r) => r.child?.isAdult).map((r) => r.childId!)),
    householdSize: new Map(rows.map((r) => [r.childId!, r.child?.familyId ? (perFamily.get(r.child.familyId)?.size ?? 1) : 1])),
  };
}

/** The event with its confirmed members (isMember() in document-variables.ts) and, with price rules, the price context attached. */
export async function withMembers<E extends { id: string; priceRules?: unknown }>(event: E): Promise<E & { memberChildIds?: Set<string>; priceContext?: PriceContext }> {
  const [members, context] = await Promise.all([memberChildIds(event.id), readPriceRules(event.priceRules) ? priceContext(event.id) : undefined]);
  return { ...event, memberChildIds: members, priceContext: context };
}
