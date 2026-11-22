// Self-check for the review queue's pure part: `npx tsx src/lib/sync-review.check.ts`
import assert from "node:assert/strict";
import { planSync, DOB_FIELD, MATCH_BY_NAME, NEW_PERSON, type ExistingParticipant, type FieldInfo, type SyncSettings } from "@/lib/participant-sync";
import { nearName, reviewPlan, samePayload, valueFits } from "@/lib/sync-review";
import { resolutionPatch } from "@/lib/sync-review-run";

const fields: FieldInfo[] = [
  { key: "Name", label: "Jméno", kind: "builtin" },
  { key: "dob", label: "Datum narození", kind: "builtin" },
  { key: "alergie", label: "Alergie", kind: "custom", fieldType: "text" },
  { key: "plavec", label: "Plavec", kind: "custom", fieldType: "boolean" },
  { key: "tricko", label: "Tričko", kind: "custom", fieldType: "select", options: ["S", "M", "L"] },
];
const existing: ExistingParticipant[] = [
  { id: "p1", name: "Jan Novák", firstName: "Jan", lastName: "Novák", groupName: null, dateOfBirth: "2015-03-04", registrationNumber: null, customFieldValues: { alergie: "pyl" }, guardians: [] },
  { id: "p2", name: "Eva Malá", firstName: "Eva", lastName: "Malá", groupName: null, dateOfBirth: "2014-01-01", registrationNumber: null, customFieldValues: {}, guardians: [] },
];
const settings: SyncSettings = { mapping: { "Jméno": "Name", Alergie: "alergie", Plavec: "plavec", "Tričko": "tricko" }, matchBy: MATCH_BY_NAME, onNew: "create", onMatch: "fill", overrides: {}, excluded: [] };
const headers = ["Jméno", "Alergie", "Plavec", "Tričko"];
const rows = [
  ["Jan Novák", "prach", "ano", "M"], // matched; allergy differs under keep -> difference
  ["Eva Mala", "", "možná", "XL"], // matched (accents folded); two bad values
  ["Jan Nowák", "", "ne", "S"], // new, near name of Jan Novák -> possible match, not created
  ["Petr Svoboda", "", "", ""], // plain new
];
// Swapped first/last name with the same birth date is a possible match too.
{
  const h = ["Jméno", "Datum narození"];
  const s2 = { ...settings, mapping: { "Jméno": "Name", "Datum narození": DOB_FIELD } };
  const pl = planSync({ headers: h, rows: [["Novák Jan", "4. 3. 2015"]], settings: s2, fields, existing, seenKeys: [] });
  assert.equal(reviewPlan({ plan: pl, replacePlan: pl, existing, fields, headers: h }).items[0]?.kind, "possible_match");
}
const run = (s: SyncSettings) => planSync({ headers, rows, settings: s, fields, existing, seenKeys: [] });
const plan = run(settings);
const replacePlan = run({ ...settings, policy: { all: "replace" } });
const { apply, items } = reviewPlan({ plan, replacePlan, existing, fields, headers });

assert.deepEqual(apply.map((r) => [r.rowNumber, r.status]), [[2, "update"], [3, "update"], [5, "create"]]);
assert.deepEqual(items.map((i) => [i.kind, i.rowKey]).sort(), [["bad_value", "k:eva mala"], ["difference", "k:jan novak"], ["possible_match", "k:jan nowak"]]);
const bad = items.find((i) => i.kind === "bad_value")!;
assert.deepEqual(bad.payload.values, [{ field: "plavec", value: "možná" }, { field: "tricko", value: "XL" }]);
assert.equal(apply[1].patch?.customFieldValues?.tricko, undefined); // taken out of the write
assert.deepEqual((items.find((i) => i.kind === "difference")!.payload.changes as { field: string }[]).map((c) => c.field), ["alergie"]);
assert.deepEqual(items.find((i) => i.kind === "possible_match")!.payload.candidates, ["p1"]);

// Decided "new person": no longer held back; with onNew "report" it is still created.
{
  const s = { ...settings, onNew: "report" as const, mergeInto: { "k:jan nowak": NEW_PERSON } };
  const r = reviewPlan({ plan: run(s), replacePlan: run({ ...s, policy: { all: "replace" } }), existing, fields, headers, mergeInto: s.mergeInto });
  assert.equal(r.apply.find((x) => x.rowKey === "k:jan nowak")?.status, "create");
  assert.equal(r.items.filter((i) => i.kind === "unmatched").length, 1); // Petr Svoboda, report only
}

// Resolutions -> connection settings.
assert.deepEqual(resolutionPatch(settings, "possible_match", { rowNumber: 4, headers, cells: [] }, "k:jan nowak", { action: "apply", choice: "p1" }), { mergeInto: { "k:jan nowak": "p1" } });
assert.deepEqual(resolutionPatch(settings, "difference", { rowNumber: 2, headers, cells: [], participantId: "p1", changes: [{ field: "alergie" }] }, "k:jan novak", { action: "apply" })?.policy?.byCell, { p1: { alergie: "replace" } });
assert.deepEqual(resolutionPatch(settings, "bad_value", { rowNumber: 3, headers, cells: [], values: [{ field: "tricko", value: "XL" }] }, "k:eva mala", { action: "apply", values: { XL: "L" } })?.valueMap, { "Tričko": { XL: "L" } });
assert.equal(resolutionPatch(settings, "possible_match", { rowNumber: 4, headers, cells: [] }, "k", { action: "apply" }), null);

assert.ok(nearName("Jan Novák", "Jan Nowak") && !nearName("Jan Novák", "Eva Malá") && !nearName("Ota", "Oto"));
assert.ok(valueFits({ fieldType: "multi", options: ["A", "B"] }, "A\nB") && !valueFits({ fieldType: "multi", options: ["A"] }, "A, C"));
assert.ok(samePayload({ a: 1 }, { a: 1 }) && !samePayload({ a: 1 }, { a: 2 }));
console.log("sync-review ok");
export {};
