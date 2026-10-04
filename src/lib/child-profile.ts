// Child profile editing, pending changes and the push to upcoming events
// (docs/registration-portal-spec.md B/D/E). Pure rules: src/lib/portal-rules.ts.
//
// Push rule: whenever a profile value actually changes (admin edit, a parent's
// `edit` field, an accepted change) it is written to every linked participant
// whose event is active AND registration-connected, only for keys that event
// has as a field. Closed events are history and never touched; unconnected
// events never read profiles at all.
import { prisma } from "@/lib/prisma";
import { fullNameFrom } from "@/lib/participant-name";
import { FIXED_PARTICIPANT_FIELDS } from "@/lib/fixed-participant-fields";
import { GUARDIANS_CHANGE_KEY, isIsoDate, isProfileBuiltin, profileValues, pushPatch, type EligibilityFacts } from "@/lib/portal-rules";

export type GuardianInput = { name?: string | null; email: string; relationship?: string | null; phone?: string | null; receivesCommunications?: boolean };

/** Cleans a guardians list from a request: trimmed, e-mail required, max 10. Null = malformed. */
export function readGuardians(raw: unknown): GuardianInput[] | null {
  if (!Array.isArray(raw) || raw.length > 10) return null;
  const out: GuardianInput[] = [];
  for (const g of raw) {
    if (!g || typeof g !== "object") return null;
    const o = g as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);
    const email = str(o.email);
    if (!email || !email.includes("@")) return null;
    out.push({ name: str(o.name), email, relationship: str(o.relationship), phone: str(o.phone), receivesCommunications: o.receivesCommunications !== false });
  }
  return out;
}

/** Guardians as the stable JSON a pending guardians change stores (same shape -> same string). */
export function guardiansJson(guardians: GuardianInput[]): string {
  return JSON.stringify(
    guardians.map((g) => ({ name: g.name ?? null, email: g.email, relationship: g.relationship ?? null, phone: g.phone ?? null, receivesCommunications: g.receivesCommunications ?? true }))
  );
}

/**
 * Applies new values (built-in keys and org field keys, flat strings, "" =
 * empty) to the profile and pushes the ones that actually changed. Returns
 * the changed keys.
 */
export async function updateProfile(childId: string, values: Record<string, string>): Promise<string[]> {
  const child = await prisma.child.findUnique({ where: { id: childId } });
  if (!child) return [];
  const current = profileValues(child);
  const changed: Record<string, string> = {};
  for (const [key, raw] of Object.entries(values)) {
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (key === "datum_narozeni" && value && !isIsoDate(value)) continue;
    if ((current[key] ?? "") !== value) changed[key] = value;
  }
  if (Object.keys(changed).length === 0) return [];

  const fieldValues = Object.fromEntries(Object.entries(current).filter(([k]) => !isProfileBuiltin(k)));
  for (const [k, v] of Object.entries(changed)) {
    if (isProfileBuiltin(k)) continue;
    if (v) fieldValues[k] = v;
    else delete fieldValues[k];
  }
  const firstName = "participant_first_name" in changed ? changed.participant_first_name || null : child.firstName;
  const lastName = "participant_last_name" in changed ? changed.participant_last_name || null : child.lastName;
  await prisma.child.update({
    where: { id: childId },
    data: {
      fieldValues,
      firstName,
      lastName,
      // An unsplit old name stays as it was until a first/last name is set.
      name: fullNameFrom(firstName, lastName) || child.name,
      ...("datum_narozeni" in changed && { dateOfBirth: changed.datum_narozeni ? new Date(changed.datum_narozeni) : null }),
    },
  });
  await pushProfile(childId, changed, false);
  return Object.keys(changed);
}

/** Replaces the profile's guardians and pushes them (match by e-mail, add new, never delete in events). */
export async function setGuardians(childId: string, guardians: GuardianInput[]): Promise<void> {
  await prisma.$transaction([
    prisma.childGuardian.deleteMany({ where: { childId } }),
    prisma.childGuardian.createMany({
      data: guardians.map((g) => ({
        childId,
        name: g.name ?? null,
        email: g.email,
        relationship: g.relationship ?? null,
        phone: g.phone ?? null,
        receivesCommunications: g.receivesCommunications ?? true,
      })),
    }),
  ]);
  await pushProfile(childId, {}, true);
}

/**
 * Writes `changed` (and, with `guardians`, the profile's guardians) into every
 * linked participant of an active, registration-connected event. Guardians
 * are matched by e-mail (case-insensitive): updated, or added when new --
 * never deleted, ParentEmailLog rows reference them.
 */
export async function pushProfile(childId: string, changed: Record<string, string>, guardians: boolean): Promise<number> {
  const participants = await prisma.participant.findMany({
    where: { childId, event: { status: "active", registrationConnected: true } },
    include: {
      guardians: true,
      event: { select: { eventParticipantFields: { where: { active: true }, select: { key: true } } } },
    },
  });
  if (participants.length === 0) return 0;
  const profileGuardians = guardians ? await prisma.childGuardian.findMany({ where: { childId } }) : [];

  for (const p of participants) {
    const patch = pushPatch(changed, p.event.eventParticipantFields.map((f) => f.key));
    const firstName = patch.firstName !== undefined ? patch.firstName || null : p.firstName;
    const lastName = patch.lastName !== undefined ? patch.lastName || null : p.lastName;
    const nameChanged = patch.firstName !== undefined || patch.lastName !== undefined;
    const hasCustom = Object.keys(patch.custom).length > 0;
    if (nameChanged || patch.dateOfBirth !== undefined || hasCustom) {
      await prisma.participant.update({
        where: { id: p.id },
        data: {
          ...(nameChanged && { firstName, lastName, name: fullNameFrom(firstName, lastName) || p.name }),
          ...(patch.dateOfBirth !== undefined && { dateOfBirth: patch.dateOfBirth ? new Date(patch.dateOfBirth) : null }),
          ...(hasCustom && { customFieldValues: { ...((p.customFieldValues as Record<string, string> | null) ?? {}), ...patch.custom } }),
        },
      });
    }
    for (const g of profileGuardians) {
      const data = { name: g.name, relationship: g.relationship, phone: g.phone, receivesCommunications: g.receivesCommunications };
      const match = p.guardians.find((pg) => pg.email.trim().toLowerCase() === g.email.trim().toLowerCase());
      if (match) await prisma.participantGuardian.update({ where: { id: match.id }, data });
      else await prisma.participantGuardian.create({ data: { ...data, participantId: p.id, email: g.email } });
    }
  }
  return participants.length;
}

/**
 * A parent's edit of an `approval` field: one pending ChildChange per child +
 * field (a newer edit replaces the older one; editing back to the live value
 * withdraws it). The live value is untouched until an admin accepts.
 */
export async function proposeChange(childId: string, fieldKey: string, oldValue: string, newValue: string): Promise<void> {
  const existing = await prisma.childChange.findFirst({ where: { childId, fieldKey, status: "pending" } });
  if (newValue === oldValue) {
    if (existing) await prisma.childChange.delete({ where: { id: existing.id } });
    return;
  }
  if (existing) await prisma.childChange.update({ where: { id: existing.id }, data: { oldValue, newValue, createdAt: new Date() } });
  else await prisma.childChange.create({ data: { childId, fieldKey, oldValue, newValue } });
}

/** Accept (applies to the profile + pushes) or reject a pending change. False = not pending (anymore). */
export async function decideChange(changeId: string, accept: boolean, userId: string): Promise<boolean> {
  const res = await prisma.childChange.updateMany({
    where: { id: changeId, status: "pending" },
    data: { status: accept ? "accepted" : "rejected", decidedById: userId, decidedAt: new Date() },
  });
  if (res.count === 0) return false;
  if (accept) {
    const change = await prisma.childChange.findUniqueOrThrow({ where: { id: changeId } });
    if (change.fieldKey === GUARDIANS_CHANGE_KEY) {
      const guardians = readGuardians(JSON.parse(change.newValue ?? "[]"));
      if (guardians && guardians.length > 0) await setGuardians(change.childId, guardians);
    } else {
      await updateProfile(change.childId, { [change.fieldKey]: change.newValue ?? "" });
    }
  }
  return true;
}

/** Labels of every profile field: built-ins (fixed rows) + org-wide templates. */
export async function profileFieldLabels(): Promise<Record<string, string>> {
  const templates = await prisma.participantFieldTemplate.findMany({ select: { key: true, label: true } });
  return {
    ...Object.fromEntries(FIXED_PARTICIPANT_FIELDS.filter((f) => isProfileBuiltin(f.key)).map((f) => [f.key, f.label])),
    ...Object.fromEntries(templates.map((t) => [t.key, t.label])),
    [GUARDIANS_CHANGE_KEY]: "Zákonní zástupci",
  };
}

/** Eligibility facts (spec H) of the given children (all when omitted). */
export async function eligibilityFacts(childIds?: string[]): Promise<(EligibilityFacts & { name: string; dateOfBirth: Date | null })[]> {
  const children = await prisma.child.findMany({
    where: childIds ? { id: { in: childIds } } : undefined,
    select: {
      id: true,
      name: true,
      dateOfBirth: true,
      participants: {
        select: { eventId: true, groupName: true, registrationStatus: true, active: true, event: { select: { startDate: true } } },
        orderBy: { event: { startDate: "desc" } },
      },
    },
    orderBy: [{ lastName: "asc" }, { name: "asc" }],
  });
  return children.map((c) => ({
    childId: c.id,
    name: c.name,
    dateOfBirth: c.dateOfBirth,
    birthYear: c.dateOfBirth ? c.dateOfBirth.getUTCFullYear() : null,
    // Most recent participation that has a group (a fresh registration has none yet).
    group: c.participants.find((p) => p.groupName)?.groupName ?? null,
    attendedEventIds: new Set(c.participants.filter((p) => p.registrationStatus === "accepted" && p.active).map((p) => p.eventId)),
  }));
}
