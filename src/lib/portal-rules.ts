// Pure rules of the parent portal and child profiles
// (docs/registration-portal-spec.md) -- no DB, no Node-only imports, so the
// self-check (scripts/test-registration-portal.ts) and client code can use them.

export type PortalAccessLevel = "edit" | "approval" | "read" | "hidden";
export const PORTAL_ACCESS_LEVELS: PortalAccessLevel[] = ["hidden", "read", "approval", "edit"];

// Built-in profile fields live on the Child's own columns, keyed like their
// fixed EventParticipantField rows (src/lib/fixed-participant-fields.ts) so a
// change pushes to the same-keyed field of an event. Name + birth date always
// need approval; guardians are always editable (spec C) -- not configurable.
export const PROFILE_BUILTINS = {
  participant_first_name: "firstName",
  participant_last_name: "lastName",
  datum_narozeni: "dateOfBirth",
} as const;
export type ProfileBuiltinKey = keyof typeof PROFILE_BUILTINS;
export const BUILTIN_PORTAL_ACCESS: PortalAccessLevel = "approval";
// Guardians decide who gets every e-mail -- a parent's change waits for an admin
// (a leaked link must not be able to redirect mail). Stored as ONE pending
// change under GUARDIANS_CHANGE_KEY holding the whole list as JSON.
export const GUARDIANS_PORTAL_ACCESS: PortalAccessLevel = "approval";
export const GUARDIANS_CHANGE_KEY = "__guardians";

export const isProfileBuiltin = (key: string): key is ProfileBuiltinKey => key in PROFILE_BUILTINS;

/** Portal access of one profile field: built-ins fixed, org fields per template, anything else hidden. */
export function portalAccessOf(key: string, templateAccess: Map<string, PortalAccessLevel>): PortalAccessLevel {
  if (isProfileBuiltin(key)) return BUILTIN_PORTAL_ACCESS;
  return templateAccess.get(key) ?? "hidden";
}

/** "Už nebude chodit" (docs/registration-slice8-spec.md #2): inactive people can't register in the portal; link e-mails skip them. */
export const isActivePerson = (p: { leftAt: Date | string | null }) => !p.leftAt;

/** A link e-mail's recipients: the (receiving) guardians of the ACTIVE people only, each address once (slice 8 #2). */
export function linkRecipients(people: { leftAt: Date | string | null; guardians: { email: string }[] }[]): string[] {
  const emails: string[] = [];
  for (const g of people.filter(isActivePerson).flatMap((p) => p.guardians)) {
    if (!emails.some((e) => e.trim().toLowerCase() === g.email.trim().toLowerCase())) emails.push(g.email);
  }
  return emails;
}

/** The Child columns that mark a person inactive (+ optional note) or active again (undo clears everything). */
export const leftData = (left: boolean, via: "portal" | "admin", note?: unknown) =>
  left
    ? { leftAt: new Date(), leftVia: via, leftNote: (typeof note === "string" && note.trim().slice(0, 2000)) || null }
    : { leftAt: null, leftVia: null, leftNote: null };

/** A profile as flat strings: built-ins ("" when unset, birth date YYYY-MM-DD) + the org field values. */
export function profileValues(child: {
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: Date | null;
  fieldValues: unknown;
}): Record<string, string> {
  const fv = child.fieldValues && typeof child.fieldValues === "object" && !Array.isArray(child.fieldValues) ? (child.fieldValues as Record<string, unknown>) : {};
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(fv)) if (typeof v === "string") values[k] = v;
  values.participant_first_name = child.firstName ?? "";
  values.participant_last_name = child.lastName ?? "";
  values.datum_narozeni = child.dateOfBirth ? child.dateOfBirth.toISOString().slice(0, 10) : "";
  return values;
}

export const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/**
 * What one changed profile writes into one participant of a connected event:
 * only keys the event has as a field. Built-ins go to the participant's own
 * columns (the caller keeps `name` in sync via fullNameFrom), the rest into
 * customFieldValues.
 */
export function pushPatch(
  changed: Record<string, string>,
  eventFieldKeys: Iterable<string>
): { firstName?: string; lastName?: string; dateOfBirth?: string; custom: Record<string, string> } {
  const keys = new Set(eventFieldKeys);
  const out: { firstName?: string; lastName?: string; dateOfBirth?: string; custom: Record<string, string> } = { custom: {} };
  for (const [key, value] of Object.entries(changed)) {
    if (!keys.has(key)) continue;
    if (isProfileBuiltin(key)) out[PROFILE_BUILTINS[key]] = value;
    else out.custom[key] = value;
  }
  return out;
}

// --- Eligibility (spec H) ---------------------------------------------------

export type Eligibility = {
  everyone?: boolean;
  birthYearFrom?: number;
  birthYearTo?: number;
  groups?: string[];
  attendedEventIds?: string[];
  childIds?: string[];
};

export type EligibilityFacts = {
  childId: string;
  birthYear: number | null;
  // groupName of the child's most recent participation that has one.
  group: string | null;
  // Events with an accepted, active participation of the child.
  attendedEventIds: Set<string>;
};

/** Event.eligibility as stored (untrusted JSON) -> a clean rule; anything malformed is dropped. */
export function readEligibility(raw: unknown): Eligibility {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const year = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 1900 && v <= 2100 ? v : undefined);
  const list = (v: unknown) => {
    const l = Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim() !== ""))] : [];
    return l.length ? l : undefined;
  };
  const rule: Eligibility = {
    everyone: o.everyone === true || undefined,
    birthYearFrom: year(o.birthYearFrom),
    birthYearTo: year(o.birthYearTo),
    groups: list(o.groups),
    attendedEventIds: list(o.attendedEventIds),
    childIds: list(o.childIds),
  };
  return Object.fromEntries(Object.entries(rule).filter(([, v]) => v !== undefined)) as Eligibility;
}

/**
 * eligible = everyone OR the child is listed by hand OR (at least one criterion
 * set AND every set criterion matches). Empty/null rule = nobody.
 */
export function isEligible(rule: Eligibility | null | undefined, f: EligibilityFacts): boolean {
  if (!rule) return false;
  if (rule.everyone) return true;
  if (rule.childIds?.includes(f.childId)) return true;
  const yearSet = rule.birthYearFrom != null || rule.birthYearTo != null;
  const groupsSet = !!rule.groups?.length;
  const attendedSet = !!rule.attendedEventIds?.length;
  if (!yearSet && !groupsSet && !attendedSet) return false;
  if (yearSet) {
    if (f.birthYear == null) return false;
    if (rule.birthYearFrom != null && f.birthYear < rule.birthYearFrom) return false;
    if (rule.birthYearTo != null && f.birthYear > rule.birthYearTo) return false;
  }
  if (groupsSet && !(f.group && rule.groups!.includes(f.group))) return false;
  if (attendedSet && !rule.attendedEventIds!.some((id) => f.attendedEventIds.has(id))) return false;
  return true;
}

// --- Birth-date gate throttle (spec G) --------------------------------------

export const GATE_MAX_FAILURES = 10;
export const GATE_WINDOW_MS = 60 * 60 * 1000;
export type GateThrottle = { failures: number; windowStart: Date | null };

/** The stored counter as of `now` (a window older than an hour starts over) + whether attempts are blocked. */
export function gateThrottle(stored: GateThrottle, now: Date): GateThrottle & { blocked: boolean } {
  const live = stored.windowStart != null && now.getTime() - stored.windowStart.getTime() < GATE_WINDOW_MS;
  const failures = live ? stored.failures : 0;
  return { failures, windowStart: live ? stored.windowStart : null, blocked: failures >= GATE_MAX_FAILURES };
}

/** Counter to store after one more wrong attempt. */
export function afterGateFailure(stored: GateThrottle, now: Date): GateThrottle {
  const cur = gateThrottle(stored, now);
  return { failures: cur.failures + 1, windowStart: cur.windowStart ?? now };
}

/** A portal link's gate: any member's birth date passes (a child link has one member). */
export const gatePasses = (input: unknown, members: { dateOfBirth: Date | null }[]) => members.some((m) => birthDateMatches(input, m.dateOfBirth));

/** Typed birth date (YYYY-MM-DD from <input type="date">) vs. the child's. No birth date on file = never passes. */
export function birthDateMatches(input: unknown, dateOfBirth: Date | null): boolean {
  return typeof input === "string" && dateOfBirth != null && input.trim() === dateOfBirth.toISOString().slice(0, 10);
}

// --- Families (docs/registration-slice3-spec.md B) --------------------------

type FamilyPerson = { id: string; isAdult: boolean; guardians: { email: string }[] };

/**
 * Proposed families ("Navržené rodiny"): people WITHOUT a family who share a
 * guardian e-mail (an adult's own contact counts too) -- transitively, so two
 * siblings + the parent who is also a member form one group. Only groups of 2+.
 * Proposals only: a family is created when an admin confirms one.
 */
export function suggestFamilies(people: FamilyPerson[]): string[][] {
  const parent = new Map(people.map((p) => [p.id, p.id]));
  const find = (id: string): string => (parent.get(id) === id ? id : find(parent.get(id)!));
  const byEmail = new Map<string, string>();
  for (const p of people) {
    for (const g of p.guardians) {
      const email = g.email.trim().toLowerCase();
      if (!email) continue;
      const other = byEmail.get(email);
      if (other) parent.set(find(p.id), find(other));
      else byEmail.set(email, p.id);
    }
  }
  const groups = new Map<string, string[]>();
  for (const p of people) groups.set(find(p.id), [...(groups.get(find(p.id)) ?? []), p.id]);
  return [...groups.values()].filter((g) => g.length > 1);
}

/** An adult member's own e-mail = their first guardian (contact) row. */
export const ownEmail = (p: { isAdult: boolean; guardians: { email: string }[] }) => (p.isAdult ? p.guardians[0]?.email.trim().toLowerCase() || null : null);

/**
 * A family's contacts, each shown once: guardians of all members, unique by
 * e-mail; a guardian whose e-mail is an adult member's own is that member
 * (`member` = their name), not a separate person.
 */
export function familyContacts<G extends { email: string }>(members: { name: string; isAdult: boolean; guardians: G[] }[]): (G & { member: string | null })[] {
  const adults = new Map(members.flatMap((m) => (ownEmail(m) ? [[ownEmail(m)!, m.name] as const] : [])));
  const seen = new Set<string>();
  const out: (G & { member: string | null })[] = [];
  for (const m of members) {
    for (const g of m.guardians) {
      const email = g.email.trim().toLowerCase();
      if (seen.has(email)) continue;
      seen.add(email);
      out.push({ ...g, member: adults.get(email) ?? null });
    }
  }
  return out;
}

// --- Portal upload (docs/registration-slice3-spec.md F) ---------------------

export const UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

/** A parent's upload by its content (never the claimed type): PDF, PNG or JPEG under 15 MB, else null. */
export function uploadContentType(bytes: Uint8Array): "application/pdf" | "image/png" | "image/jpeg" | null {
  if (bytes.length === 0 || bytes.length > UPLOAD_MAX_BYTES) return null;
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  return null;
}
