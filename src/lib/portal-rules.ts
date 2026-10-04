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
export const GUARDIANS_PORTAL_ACCESS: PortalAccessLevel = "edit";

export const isProfileBuiltin = (key: string): key is ProfileBuiltinKey => key in PROFILE_BUILTINS;

/** Portal access of one profile field: built-ins fixed, org fields per template, anything else hidden. */
export function portalAccessOf(key: string, templateAccess: Map<string, PortalAccessLevel>): PortalAccessLevel {
  if (isProfileBuiltin(key)) return BUILTIN_PORTAL_ACCESS;
  return templateAccess.get(key) ?? "hidden";
}

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

/** Typed birth date (YYYY-MM-DD from <input type="date">) vs. the child's. No birth date on file = never passes. */
export function birthDateMatches(input: unknown, dateOfBirth: Date | null): boolean {
  return typeof input === "string" && dateOfBirth != null && input.trim() === dateOfBirth.toISOString().slice(0, 10);
}
