// Participant import/sync from a table -- the pure half (shared by the import
// page, the sync route and the hourly cron). A connection ("propojení") is a
// sheet + column mapping + how rows are matched to existing participants and
// what happens to matches and new rows. planSync() turns the table into one
// plan row per sheet row: create / update (with the exact changes) / same /
// unmatched / error ..., and the server applies exactly that plan -- so the
// preview the user sees is what the sync does.
//
// Deliberately prisma-free: the import page imports guessTarget() from here.

import { FIXED_PARTICIPANT_FIELDS } from "@/lib/fixed-participant-fields";
import { splitFullName, fullNameFrom } from "@/lib/participant-name";

export type FieldInfo = { key: string; label: string; kind: "custom" | "builtin" | "guardian" | "computed" };

function fixedKey(match: (f: (typeof FIXED_PARTICIPANT_FIELDS)[number]) => boolean): string {
  return FIXED_PARTICIPANT_FIELDS.find(match)?.key ?? "";
}
export const NAME_FIELD = fixedKey((f) => f.builtinProp === "name");
export const FIRST_NAME_FIELD = fixedKey((f) => f.builtinProp === "firstName");
export const LAST_NAME_FIELD = fixedKey((f) => f.builtinProp === "lastName");
export const GROUP_FIELD = fixedKey((f) => f.builtinProp === "groupName");
export const DOB_FIELD = fixedKey((f) => f.builtinProp === "dateOfBirth");
export const GUARDIAN_NAME_FIELD = fixedKey((f) => f.guardianProp === "name");
export const GUARDIAN_EMAIL_FIELD = fixedKey((f) => f.guardianProp === "email");
export const GUARDIAN_RELATIONSHIP_FIELD = fixedKey((f) => f.guardianProp === "relationship");
export const GUARDIAN_PHONE_FIELD = fixedKey((f) => f.guardianProp === "phone");

// Pseudo targets/match keys. "__" can't collide with field keys (they start with a letter).
export const IGNORE = "ignore";
export const REGNUM_TARGET = "__registrationNumber"; // mapping target used only for matching, never written
export const MATCH_BY_NAME = "__name"; // name (+ date of birth when two share a name)

export type OnNew = "create" | "report";
export type OnMatch = "fill" | "overwrite" | "skip";
export const SYNC_INTERVALS = [1, 3, 6, 12, 24];

/** Everything that decides the plan (the connection's settings minus scheduling/bookkeeping). */
export type SyncSettings = {
  mapping: Record<string, string>; // header text (trimmed) -> field key / REGNUM_TARGET
  matchBy: string; // MATCH_BY_NAME | REGNUM_TARGET | custom field key
  onNew: OnNew;
  onMatch: OnMatch;
  // Edited cells: rowKey -> header -> value. Kept on the connection, so every
  // later sync applies the same fix (the sheet itself is never written).
  overrides: Record<string, Record<string, string>>;
  excluded: string[]; // rowKeys never imported
};

export type ParticipantSync = SyncSettings & {
  id: string;
  name: string;
  sheetId: string;
  tab?: string;
  autoSync: boolean;
  everyHours: number;
  // Match keys already created or matched: a key seen before that no longer
  // matches anybody (participant deleted in the app) is NOT created again.
  seenKeys: string[];
  runningSince?: string;
  lastSync?: SyncRunSummary;
};

export type SyncIssue = { row: number; status: string; code?: string; key?: string }; // code = error code when status "error"
export type SyncRunSummary = {
  at: string;
  auto: boolean;
  counts: Record<string, number>;
  issues: SyncIssue[];
  error?: { code: string; params?: Record<string, string> };
};

export type ExistingParticipant = {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  groupName: string | null;
  dateOfBirth: string | null; // YYYY-MM-DD
  registrationNumber: number | null;
  customFieldValues: Record<string, string>;
  guardians: { id: string; email: string; name: string | null; phone: string | null; relationship: string | null }[];
};

export type GuardianRow = { name: string; email: string; relationship: string; phone: string };
export type ParsedRow = {
  name: string;
  firstName: string;
  lastName: string;
  groupName: string;
  dateOfBirthRaw: string;
  dateOfBirthIso: string | undefined;
  guardians: GuardianRow[];
  customFieldValues: Record<string, string>;
  registrationNumber: string;
};

export type RowStatus =
  | "create"
  | "update"
  | "same"
  | "skip" // matched, onMatch = skip
  | "unmatched" // no participant, onNew = report
  | "seen_missing" // created/matched before, participant since deleted -> not recreated
  | "superseded" // a later row has the same key (form sent again) -- the later one wins
  | "excluded"
  | "error";

export type Change = { field: string; from: string; to: string }; // field = field key, or "guardian"
export type ParticipantPatch = {
  firstName?: string | null;
  lastName?: string | null;
  name?: string;
  groupName?: string;
  dateOfBirth?: string;
  customFieldValues?: Record<string, string>; // only the changed keys (merged server-side)
  guardiansAdd: GuardianRow[];
  guardiansUpdate: { id: string; name?: string; phone?: string; relationship?: string }[];
};

export type PlanRow = {
  rowNumber: number; // sheet row (header = 1)
  rowKey: string;
  cells: string[]; // after overrides
  edited: number[]; // column indexes changed by overrides
  matchKey: string | null;
  status: RowStatus;
  errors: string[];
  participant: { id: string; name: string } | null;
  changes: Change[];
  create?: ParsedRow;
  patch?: ParticipantPatch;
};

const EMAIL_RE = /\S+@\S+\.\S+/;
const DATE_SEP_RE = /^(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{4})$/;

export function guessTarget(header: string, fields: FieldInfo[]): string {
  const h = header.trim().toLowerCase();
  if (!h) return IGNORE;
  if (h.includes("narozen") || h.includes("datum nar") || h.includes("dob") || h.includes("birth")) return DOB_FIELD;
  if (h.includes("telefon") || h.includes("phone")) return GUARDIAN_PHONE_FIELD;
  if (h.includes("vztah") || h.includes("relationship")) return GUARDIAN_RELATIONSHIP_FIELD;
  if (h.includes("rodič") || h.includes("rodic") || h.includes("zástupce") || h.includes("zastupce") || h.includes("guardian"))
    return GUARDIAN_NAME_FIELD;
  // "Příjmení" before the generic jméno/name match -- once accents are folded
  // every "příjmení" header also contains "jmeni", so order matters.
  if (h.includes("příjmení") || h.includes("prijmeni") || h.includes("surname") || h.includes("last name")) return LAST_NAME_FIELD;
  if (h.includes("křestní") || h.includes("krestni") || h.includes("first name")) return FIRST_NAME_FIELD;
  if (h.includes("jméno") || h.includes("jmeno") || h.includes("name")) return NAME_FIELD;
  if (h.includes("skupina") || h.includes("oddíl") || h.includes("oddil") || h.includes("group")) return GROUP_FIELD;
  if (h.includes("e-mail") || h.includes("email") || h.includes("kontakt")) return GUARDIAN_EMAIL_FIELD;
  const byLabel = fields.find((f) => h.includes(f.label.toLowerCase()));
  return byLabel ? byLabel.key : IGNORE;
}

/** Diacritics-, case- and whitespace-insensitive ("Novak" matches "Novák"). */
export function normalizeKey(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

// DD/MM vs MM/DD is decided once per table (a part > 12 can only be a day), day-first by default.
function detectDateOrder(rawValues: string[]): "dayFirst" | "monthFirst" {
  for (const raw of rawValues) {
    const m = raw.trim().match(DATE_SEP_RE);
    if (!m) continue;
    if (Number(m[1]) > 12) return "dayFirst";
    if (Number(m[2]) > 12) return "monthFirst";
  }
  return "dayFirst";
}

function formatDob(raw: string, order: "dayFirst" | "monthFirst"): string | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  const m = v.match(DATE_SEP_RE);
  if (m) {
    const [, first, second, year] = m;
    const day = order === "dayFirst" ? first : second;
    const month = order === "dayFirst" ? second : first;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const parsed = new Date(v);
  return isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

/** Header list -> target per column (saved mapping by header text). */
export function mappingFor(headers: string[], mapping: Record<string, string>): string[] {
  return headers.map((h) => mapping[h.trim()] ?? IGNORE);
}

// Every column mapped to a target is combined. Custom fields fed by several
// columns keep "Header: value" so free text (allergies...) says which column said what.
function resolveField(cells: string[], headers: string[], targets: string[], target: string, isCustom: boolean): string {
  const found: { header: string; value: string }[] = [];
  targets.forEach((m, i) => {
    const v = m === target ? (cells[i] ?? "").trim() : "";
    if (v) found.push({ header: headers[i]?.trim() || `#${i + 1}`, value: v });
  });
  if (found.length <= 1 || !isCustom) return found.map((f) => f.value).join(" ");
  return found.map((f) => `${f.header}: ${f.value}`).join(" | ");
}

function columnsFor(cells: string[], targets: string[], target: string): string[] {
  return targets.flatMap((m, i) => (m === target && (cells[i] ?? "").trim() ? [(cells[i] ?? "").trim()] : []));
}

function parseRow(cells: string[], headers: string[], targets: string[], fields: FieldInfo[], dateOrder: "dayFirst" | "monthFirst"): ParsedRow {
  const resolve = (target: string) => resolveField(cells, headers, targets, target, false);
  // Dedicated first/last columns win; otherwise the combined name is split (participant-name.ts rule).
  let firstName = resolve(FIRST_NAME_FIELD);
  let lastName = resolve(LAST_NAME_FIELD);
  const combined = resolve(NAME_FIELD);
  if (!firstName && !lastName && combined) {
    const split = splitFullName(combined);
    firstName = split.firstName;
    lastName = split.lastName ?? "";
  }
  // Guardians paired by position: the Nth e-mail column goes with the Nth name/phone/relationship column.
  const emails = columnsFor(cells, targets, GUARDIAN_EMAIL_FIELD);
  const gNames = columnsFor(cells, targets, GUARDIAN_NAME_FIELD);
  const phones = columnsFor(cells, targets, GUARDIAN_PHONE_FIELD);
  const rels = columnsFor(cells, targets, GUARDIAN_RELATIONSHIP_FIELD);
  const customFieldValues: Record<string, string> = {};
  for (const f of fields) {
    if (f.kind !== "custom") continue;
    const v = resolveField(cells, headers, targets, f.key, true);
    if (v) customFieldValues[f.key] = v;
  }
  const dateOfBirthRaw = resolve(DOB_FIELD);
  return {
    name: fullNameFrom(firstName, lastName) || combined,
    firstName,
    lastName,
    groupName: resolve(GROUP_FIELD),
    dateOfBirthRaw,
    dateOfBirthIso: formatDob(dateOfBirthRaw, dateOrder),
    guardians: emails.map((email, i) => ({ email, name: gNames[i] ?? "", phone: phones[i] ?? "", relationship: rels[i] ?? "" })),
    customFieldValues,
    registrationNumber: resolve(REGNUM_TARGET),
  };
}

function matchKeyOf(row: ParsedRow, matchBy: string): string | null {
  if (matchBy === MATCH_BY_NAME) return row.name ? normalizeKey(row.name) : null;
  if (matchBy === REGNUM_TARGET) {
    const n = row.registrationNumber.replace(/\s/g, "");
    return /^\d+$/.test(n) ? String(Number(n)) : null;
  }
  const v = row.customFieldValues[matchBy];
  return v ? normalizeKey(v) : null;
}

function participantKeys(p: ExistingParticipant, matchBy: string): string | null {
  if (matchBy === MATCH_BY_NAME) return normalizeKey(p.name);
  if (matchBy === REGNUM_TARGET) return p.registrationNumber === null ? null : String(p.registrationNumber);
  const v = p.customFieldValues[matchBy];
  return v ? normalizeKey(v) : null;
}

/** Only "create" needs something stored on the new participant to find it again next time. */
export function canCreate(matchBy: string): boolean {
  return matchBy !== REGNUM_TARGET;
}

function diff(row: ParsedRow, p: ExistingParticipant, mode: "fill" | "overwrite", matchBy: string): { patch: ParticipantPatch; changes: Change[] } {
  const patch: ParticipantPatch = { guardiansAdd: [], guardiansUpdate: [] };
  const changes: Change[] = [];
  const take = (current: string | null | undefined, incoming: string) =>
    !!incoming && (mode === "overwrite" ? (current ?? "") !== incoming : !current);

  // Names are the identity when matching by name -- never rewritten then.
  if (matchBy !== MATCH_BY_NAME && (row.firstName || row.lastName)) {
    const fullNow = fullNameFrom(p.firstName, p.lastName) || p.name;
    const fullNew = fullNameFrom(row.firstName, row.lastName);
    if (mode === "overwrite" ? fullNow !== fullNew : !p.firstName && !p.lastName && !p.name) {
      patch.firstName = row.firstName || null;
      patch.lastName = row.lastName || null;
      patch.name = fullNew;
      changes.push({ field: NAME_FIELD, from: fullNow, to: fullNew });
    }
  }
  if (take(p.groupName, row.groupName)) {
    patch.groupName = row.groupName;
    changes.push({ field: GROUP_FIELD, from: p.groupName ?? "", to: row.groupName });
  }
  if (row.dateOfBirthIso && take(p.dateOfBirth, row.dateOfBirthIso)) {
    patch.dateOfBirth = row.dateOfBirthIso;
    changes.push({ field: DOB_FIELD, from: p.dateOfBirth ?? "", to: row.dateOfBirthIso });
  }
  for (const [key, value] of Object.entries(row.customFieldValues)) {
    // The match key already matched (case/accents folded) -- never rewritten.
    if (key === matchBy || !take(p.customFieldValues[key], value)) continue;
    (patch.customFieldValues ??= {})[key] = value;
    changes.push({ field: key, from: p.customFieldValues[key] ?? "", to: value });
  }
  for (const g of row.guardians) {
    const existing = p.guardians.find((x) => x.email.trim().toLowerCase() === g.email.trim().toLowerCase());
    if (!existing) {
      patch.guardiansAdd.push(g);
      changes.push({ field: "guardian", from: "", to: g.email });
      continue;
    }
    const upd: ParticipantPatch["guardiansUpdate"][number] = { id: existing.id };
    if (take(existing.name, g.name)) upd.name = g.name;
    if (take(existing.phone, g.phone)) upd.phone = g.phone;
    if (take(existing.relationship, g.relationship)) upd.relationship = g.relationship;
    if (Object.keys(upd).length > 1) {
      patch.guardiansUpdate.push(upd);
      changes.push({ field: "guardian", from: g.email, to: [upd.name, upd.phone, upd.relationship].filter(Boolean).join(", ") });
    }
  }
  return { patch, changes };
}

/**
 * The whole table -> one plan row per non-empty sheet row. `rows` are the data
 * rows under the header (sheet row = index + 2). Nothing here writes anything.
 */
export function planSync(input: {
  headers: string[];
  rows: string[][];
  settings: SyncSettings;
  fields: FieldInfo[];
  existing: ExistingParticipant[];
  seenKeys: string[];
}): PlanRow[] {
  const { headers, settings, fields, existing } = input;
  const targets = mappingFor(headers, settings.mapping);
  const headerIndex = new Map(headers.map((h, i) => [h.trim(), i]));
  const rawDobs = input.rows.map((cells) => resolveField(cells, headers, targets, DOB_FIELD, false));
  const dateOrder = detectDateOrder(rawDobs);
  const seen = new Set(input.seenKeys);
  const excluded = new Set(settings.excluded);

  const byKey = new Map<string, ExistingParticipant[]>();
  for (const p of existing) {
    const k = participantKeys(p, settings.matchBy);
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), p]);
  }

  const plan: PlanRow[] = [];
  input.rows.forEach((raw, i) => {
    if (!raw.some((c) => (c ?? "").trim())) return;
    const rowNumber = i + 2;
    // rowKey comes from the RAW row, so an edited key cell keeps its overrides.
    const rawKey = matchKeyOf(parseRow(raw, headers, targets, fields, dateOrder), settings.matchBy);
    const rowKey = rawKey ? `k:${rawKey}` : `r:${rowNumber}`;
    const cells = headers.map((_, c) => raw[c] ?? "");
    const edited: number[] = [];
    for (const [header, value] of Object.entries(settings.overrides[rowKey] ?? {})) {
      const c = headerIndex.get(header);
      if (c === undefined || cells[c] === value) continue;
      cells[c] = value;
      edited.push(c);
    }
    const row = parseRow(cells, headers, targets, fields, dateOrder);
    const matchKey = matchKeyOf(row, settings.matchBy);
    const out: PlanRow = { rowNumber, rowKey, cells, edited, matchKey, status: "error", errors: [], participant: null, changes: [] };
    plan.push(out);

    if (excluded.has(rowKey)) return void (out.status = "excluded");
    if (row.guardians.some((g) => !EMAIL_RE.test(g.email))) out.errors.push("invalid_email");
    if (row.firstName && EMAIL_RE.test(row.firstName)) out.errors.push("name_looks_like_email");
    if (!matchKey) out.errors.push(settings.matchBy === MATCH_BY_NAME ? "missing_name" : "missing_key");

    let candidates = matchKey ? (byKey.get(matchKey) ?? []) : [];
    // Same name twice (twins, coincidence): date of birth picks one; still two -> refuse to guess.
    if (candidates.length > 1 && row.dateOfBirthIso) {
      const byDob = candidates.filter((p) => p.dateOfBirth === row.dateOfBirthIso);
      if (byDob.length > 0) candidates = byDob;
    }
    if (candidates.length > 1) out.errors.push("ambiguous_match");
    if (out.errors.length > 0) return;

    const p = candidates[0];
    if (p) {
      out.participant = { id: p.id, name: p.name };
      if (settings.onMatch === "skip") return void (out.status = "skip");
      const { patch, changes } = diff(row, p, settings.onMatch, settings.matchBy);
      out.changes = changes;
      out.status = changes.length > 0 ? "update" : "same";
      if (changes.length > 0) out.patch = patch;
      return;
    }
    if (seen.has(matchKey!)) return void (out.status = "seen_missing");
    if (settings.onNew !== "create" || !canCreate(settings.matchBy)) return void (out.status = "unmatched");
    if (!row.name) {
      out.errors.push("missing_name");
      return;
    }
    out.status = "create";
    out.create = row;
  });

  // A key sent more than once (form submitted again): the last row wins.
  const lastRowOfKey = new Map<string, number>();
  for (const r of plan) if (r.matchKey && r.status !== "excluded" && r.status !== "error") lastRowOfKey.set(r.matchKey, r.rowNumber);
  for (const r of plan) {
    if (!r.matchKey || r.status === "excluded" || r.status === "error") continue;
    if (lastRowOfKey.get(r.matchKey) !== r.rowNumber) {
      r.status = "superseded";
      r.changes = [];
      delete r.patch;
      delete r.create;
    }
  }
  return plan;
}

export function countPlan(plan: PlanRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of plan) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

/** Tolerant reader for Event.participantSyncs (and untrusted bodies' shape). */
export function readSyncs(value: unknown): ParticipantSync[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    if (!v || typeof v !== "object" || typeof (v as { id?: unknown }).id !== "string") return [];
    const s = v as Partial<ParticipantSync> & { id: string };
    return [
      {
        ...s,
        name: typeof s.name === "string" ? s.name : "",
        sheetId: typeof s.sheetId === "string" ? s.sheetId : "",
        ...sanitizeSettings(s),
        autoSync: s.autoSync === true,
        everyHours: SYNC_INTERVALS.includes(s.everyHours as number) ? (s.everyHours as number) : 6,
        seenKeys: Array.isArray(s.seenKeys) ? s.seenKeys.filter((k) => typeof k === "string") : [],
      },
    ];
  });
}

const isStringRecord = (v: unknown): v is Record<string, string> =>
  !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string");

/** Untrusted settings -> valid ones (unknown values -> safe defaults). Field keys are checked by the caller. */
export function sanitizeSettings(s: Partial<SyncSettings>): SyncSettings {
  const overrides: SyncSettings["overrides"] = {};
  if (s.overrides && typeof s.overrides === "object") {
    for (const [k, v] of Object.entries(s.overrides).slice(0, 5000)) if (isStringRecord(v)) overrides[k] = v;
  }
  return {
    mapping: isStringRecord(s.mapping) ? s.mapping : {},
    matchBy: typeof s.matchBy === "string" && s.matchBy ? s.matchBy : MATCH_BY_NAME,
    onNew: s.onNew === "report" ? "report" : "create",
    onMatch: s.onMatch === "overwrite" || s.onMatch === "skip" ? s.onMatch : "fill",
    overrides,
    excluded: Array.isArray(s.excluded) ? s.excluded.filter((k) => typeof k === "string").slice(0, 5000) : [],
  };
}
