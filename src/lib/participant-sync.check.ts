// Self-check for the pure participant sync planner: `npx tsx src/lib/participant-sync.check.ts`
import assert from "node:assert/strict";
import { planSync, readSyncs, MATCH_BY_NAME, REGNUM_TARGET, type ExistingParticipant, type FieldInfo, type SyncSettings } from "@/lib/participant-sync";

const fields: FieldInfo[] = [
  { key: "Name", label: "Jméno a příjmení dítěte", kind: "builtin" },
  { key: "skupina", label: "Skupina", kind: "builtin" },
  { key: "formId", label: "Číslo přihlášky", kind: "custom" },
  { key: "alergie", label: "Alergie", kind: "custom" },
];
const existing: ExistingParticipant[] = [
  {
    id: "p1",
    name: "Jan Novák",
    firstName: "Jan",
    lastName: "Novák",
    groupName: "A",
    dateOfBirth: "2015-03-04",
    registrationNumber: 7,
    customFieldValues: { formId: "F-1", alergie: "" },
    guardians: [{ id: "g1", email: "mama@x.cz", name: null, phone: null, relationship: null }],
  },
];
const base: SyncSettings = { mapping: {}, matchBy: MATCH_BY_NAME, onNew: "create", onMatch: "fill", overrides: {}, excluded: [] };

// Registration form, matched by name: existing -> fill empty only, new -> create, empty row ignored.
{
  const plan = planSync({
    headers: ["Jméno", "Skupina", "Alergie", "E-mail"],
    rows: [["Jan Novak", "B", "pyl", "mama@x.cz"], [], ["Eva Malá", "C", "", "tata@y.cz"]],
    settings: { ...base, mapping: { "Jméno": "Name", Skupina: "skupina", Alergie: "alergie", "E-mail": "Email" } },
    fields,
    existing,
    seenKeys: [],
  });
  assert.deepEqual(plan.map((r) => [r.rowNumber, r.status]), [[2, "update"], [4, "create"]]);
  // group already set -> untouched in fill mode; empty allergy filled; known guardian e-mail not re-added
  assert.deepEqual(plan[0].changes.map((c) => c.field), ["alergie"]);
  assert.equal(plan[1].create?.guardians[0].email, "tata@y.cz");
}

// Health form by custom id: overwrite, report unknown ids, an edited cell (override) applies.
{
  const settings: SyncSettings = {
    ...base,
    mapping: { ID: "formId", Skupina: "skupina", Jméno: "Name" },
    matchBy: "formId",
    onNew: "report",
    onMatch: "overwrite",
    overrides: { "k:f-9": { ID: "F-1" } }, // typo in the form fixed in the preview
  };
  const plan = planSync({ headers: ["ID", "Skupina", "Jméno"], rows: [["F-9", "B", "Honza Novák"], ["F-2", "B", "X Y"]], settings, fields, existing, seenKeys: [] });
  assert.deepEqual(plan.map((r) => r.status), ["update", "unmatched"]);
  assert.deepEqual(plan[0].edited, [0]);
  assert.deepEqual(plan[0].changes.map((c) => c.field).sort(), ["Name", "skupina"]);
  assert.equal(plan[0].patch?.name, "Honza Novák");
}

// Registration number can match but never creates; seen-then-deleted keys are not recreated;
// the same key twice -> last row wins; excluded rows stay out.
{
  const plan = planSync({
    headers: ["Evidenční č.", "Skupina"],
    rows: [["7", "A"], ["8", "B"]],
    settings: { ...base, mapping: { "Evidenční č.": REGNUM_TARGET, Skupina: "skupina" }, matchBy: REGNUM_TARGET },
    fields,
    existing,
    seenKeys: [],
  });
  assert.deepEqual(plan.map((r) => r.status), ["same", "unmatched"]);

  const settings = { ...base, mapping: { ID: "formId", Jméno: "Name" }, matchBy: "formId", excluded: ["k:f-5"] };
  const rows = [["F-3", "Ana"], ["F-4", "Bea"], ["F-4", "Bea Nová"], ["F-5", "Test"]];
  const p2 = planSync({ headers: ["ID", "Jméno"], rows, settings, fields, existing, seenKeys: ["f-3"] });
  assert.deepEqual(p2.map((r) => r.status), ["seen_missing", "superseded", "create", "excluded"]);
  assert.equal(p2[2].create?.name, "Bea Nová");
}

assert.deepEqual(readSyncs([{ id: "a", onMatch: "bogus", everyHours: 5 }, { nope: 1 }]).map((s) => [s.onMatch, s.everyHours, s.matchBy]), [["fill", 6, MATCH_BY_NAME]]);
console.log("participant-sync ok");
