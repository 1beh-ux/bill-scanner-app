// Fields Manager phase 5 (design §10): an automatic sync can't ask, so anything uncertain goes to the review queue
// ("Ke kontrole") instead of being written. Pure (no prisma): which plan rows are held back and what is queued.
//   possible_match  a new row that looks like someone already registered (same name + other birth date, a near name,
//                   or several people with the name) -- not created, an admin decides
//   unmatched       a row with no participant while new rows are only reported
//   difference      a filled value the table has differently under "keep" -- the row is written, the cell isn't
//   bad_value       a choice / yes-no value the field doesn't know and the connection can't translate -- the rest of
//                   the row is written, that value isn't
import { normalizeKey, NEW_PERSON, type ExistingParticipant, type FieldInfo, type PlanRow } from "@/lib/participant-sync";
import { toBoolean } from "@/lib/participant-fields";

export type ReviewKind = "possible_match" | "unmatched" | "difference" | "bad_value";
export type ReviewItemIn = { rowKey: string; kind: ReviewKind; payload: Record<string, unknown> };

/** Edit distance, capped: enough to spot "Novak"/"Nowak"-style typos. */
export function nearName(a: string, b: string): boolean {
  const x = normalizeKey(a);
  const y = normalizeKey(b);
  if (x === y || Math.abs(x.length - y.length) > 2 || x.length < 5) return false;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length] <= 2;
}

/** "Kvido Sešitový" vs "Sešitový Kvido": the same words in another order. */
const sameWords = (a: string, b: string) => normalizeKey(a).split(" ").sort().join(" ") === normalizeKey(b).split(" ").sort().join(" ");

/** Is `value` something the field stores as it is? Only choice / yes-no fields are checked. */
export function valueFits(f: Pick<FieldInfo, "fieldType" | "options">, value: string): boolean {
  const opts = Array.isArray(f.options) ? f.options.filter((o): o is string => typeof o === "string") : [];
  if (f.fieldType === "boolean" || f.fieldType === "consent") return value === "true" || value === "false" || toBoolean(value, f.options) !== null;
  if (f.fieldType === "select") return !opts.length || opts.includes(value);
  if (f.fieldType === "multi") return !opts.length || value.split("\n").every((p) => opts.includes(p));
  return true;
}

/**
 * plan: what the connection would write; replacePlan: the same table planned with "replace" everywhere (to see the
 * differences "keep" hides). Returns the rows to write (held-back rows dropped, bad values taken out) and the items.
 */
export function reviewPlan(input: {
  plan: PlanRow[];
  replacePlan: PlanRow[];
  existing: Pick<ExistingParticipant, "id" | "name" | "dateOfBirth">[];
  fields: FieldInfo[];
  headers: string[];
  mergeInto?: Record<string, string>;
}): { apply: PlanRow[]; items: ReviewItemIn[] } {
  const { plan, existing, headers } = input;
  const fieldOf = new Map(input.fields.map((f) => [f.key, f]));
  const row = (r: PlanRow) => ({ rowNumber: r.rowNumber, headers, cells: r.cells });
  const items: ReviewItemIn[] = [];
  const apply: PlanRow[] = [];

  for (const r of plan) {
    const decidedNew = input.mergeInto?.[r.rowKey] === NEW_PERSON;
    if (r.status === "create" && r.create && !decidedNew) {
      const name = r.create.name;
      const dob = r.create.dateOfBirthIso ?? null;
      const candidates = existing.filter(
        (p) => (normalizeKey(p.name) === normalizeKey(name) && p.dateOfBirth !== dob) || nearName(p.name, name) || (!!dob && p.dateOfBirth === dob && sameWords(p.name, name)),
      );
      if (candidates.length) {
        items.push({ rowKey: r.rowKey, kind: "possible_match", payload: { ...row(r), name, dateOfBirth: r.create.dateOfBirthIso ?? null, candidates: candidates.map((p) => p.id) } });
        continue;
      }
    }
    if (r.status === "error" && r.errors.includes("ambiguous_match")) {
      const name = r.cells.join(" ");
      items.push({ rowKey: r.rowKey, kind: "possible_match", payload: { ...row(r), name: r.matchKey ?? name, candidates: existing.filter((p) => normalizeKey(p.name) === r.matchKey).map((p) => p.id) } });
      continue;
    }
    if (r.status === "unmatched") {
      items.push({ rowKey: r.rowKey, kind: "unmatched", payload: row(r) });
      continue;
    }
    // Values the field doesn't take: out of the write, into the queue.
    const values = r.create?.customFieldValues ?? r.patch?.customFieldValues;
    const bad = Object.entries(values ?? {}).filter(([k, v]) => fieldOf.has(k) && !valueFits(fieldOf.get(k)!, v));
    if (bad.length && values) {
      for (const [k] of bad) delete values[k];
      r.changes = r.changes.filter((c) => !bad.some(([k]) => k === c.field));
      items.push({ rowKey: r.rowKey, kind: "bad_value", payload: { ...row(r), participantId: r.participant?.id ?? null, values: bad.map(([field, value]) => ({ field, value })) } });
    }
    apply.push(r);
  }

  // Differences "keep" left alone (a filled value the table has otherwise) -- for a person, not a new row.
  for (const r of input.replacePlan) {
    if (!r.participant || r.status !== "update") continue;
    const written = plan.find((p) => p.rowNumber === r.rowNumber);
    const done = new Set(written?.changes.map((c) => c.field));
    const diffs = r.changes.filter((c) => c.from && c.field !== "guardian" && !done.has(c.field));
    if (diffs.length) items.push({ rowKey: r.rowKey, kind: "difference", payload: { ...row(r), participantId: r.participant.id, name: r.participant.name, changes: diffs } });
  }
  return { apply, items };
}

/** Stable comparison of payloads: a re-run with the same content must not reopen a dismissed item. */
export const samePayload = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
