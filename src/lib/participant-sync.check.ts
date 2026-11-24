// Self-check for the pure participant sync planner: `npx tsx src/lib/participant-sync.check.ts`
import assert from "node:assert/strict";
import { canCreate, fieldMode, guessMappingByLabel, guessType, planSync, policyOf, readSyncs, sanitizeSettings, slotMapping, MATCH_BY_NAME, REGNUM_TARGET, type ExistingParticipant, type FieldInfo, type SyncSettings } from "@/lib/participant-sync";

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

// Payment sheet matched by a computed field (variable symbol): match-only, numbers
// compared without spaces/leading zeros, never creates participants.
{
  const withVs: FieldInfo[] = [...fields, { key: "var_symb", label: "Variabilní symbol", kind: "computed", computedType: "variable_symbol" }, { key: "zaplaceno", label: "Zaplaceno", kind: "custom", fieldType: "boolean" }];
  const people = [{ ...existing[0], values: { var_symb: "261100007" } }];
  const plan = planSync({
    headers: ["VS", "Zaplaceno"],
    rows: [["0261 100 007", "ano"], ["261100099", "ano"]],
    settings: { ...base, mapping: { VS: "var_symb", Zaplaceno: "zaplaceno" }, matchBy: "var_symb", onNew: "create", onMatch: "overwrite" },
    fields: withVs,
    existing: people,
    seenKeys: [],
  });
  assert.deepEqual(plan.map((r) => r.status), ["update", "unmatched"]);
  assert.deepEqual(plan[0].patch?.customFieldValues, { zaplaceno: "true" }); // "ano" stored as true
  assert.equal(canCreate("var_symb", withVs), false);
  assert.equal(canCreate("formId", withVs), true);
}

assert.deepEqual(readSyncs([{ id: "a", onMatch: "bogus", everyHours: 5 }, { nope: 1 }]).map((s) => [s.onMatch, s.everyHours, s.matchBy]), [["fill", 6, MATCH_BY_NAME]]);

// ---- Fields Manager phase 4 ----
// Old connections read back without the new keys (so they plan exactly as before).
assert.deepEqual(Object.keys(sanitizeSettings({ onMatch: "overwrite" })).sort(), ["excluded", "mapping", "matchBy", "onMatch", "onNew", "overrides"]);
assert.deepEqual(policyOf({ onMatch: "fill" }), { all: "keep" });
assert.deepEqual(policyOf({ onMatch: "overwrite" }), { all: "replace" });
// Policy precedence: all -> category -> person -> cell, most specific wins.
{
  const pol = { all: "keep" as const, byCategory: { zdravi: "replace" as const }, byPerson: { p1: "keep" as const }, byCell: { p1: { alergie: "replace" as const } } };
  assert.equal(fieldMode(pol, "p2", "alergie", "zdravi"), "replace"); // category
  assert.equal(fieldMode(pol, "p1", "leky", "zdravi"), "keep"); // person beats category
  assert.equal(fieldMode(pol, "p1", "alergie", "zdravi"), "replace"); // cell beats person
  assert.equal(fieldMode({ all: "skip" }, "p1", "x"), "keep");
}
// Slot guardians, a guardian without e-mail reported, value translation, per-cell replace, merge into.
{
  const plan = planSync({
    headers: ["Jméno", "Alergie", "Rodič 2", "Mail 2", "Rodič 3", "Plavec"],
    rows: [
      ["Jan Novák", "prach", "Petr Novák", "tata@x.cz", "Babička", "A"],
      ["Jenda Novák", "", "", "", "", "N"],
    ],
    settings: {
      ...base,
      mapping: { "Jméno": "Name", Alergie: "alergie", "Rodič 2": "guardian2_name", "Mail 2": "guardian2_email", "Rodič 3": "guardian3_name", Plavec: "plavec" },
      valueMap: { Plavec: { A: "true", N: "false" } },
      policy: { all: "keep", byCell: { p1: { alergie: "replace" } } },
      mergeInto: { "k:jenda novak": "p1" },
    },
    fields: [...fields, { key: "plavec", label: "Plavec", kind: "custom", fieldType: "boolean" }],
    existing: [{ ...existing[0], customFieldValues: { formId: "F-1", alergie: "pyl" } }],
    seenKeys: [],
  });
  const [a, b] = plan;
  assert.equal(a.status, "update");
  assert.deepEqual(a.patch?.customFieldValues, { alergie: "prach", plavec: "true" }); // replaced (cell rule) + translated
  assert.deepEqual(a.patch?.guardiansAdd, [{ name: "Petr Novák", email: "tata@x.cz", relationship: "", phone: "", position: 2 }]);
  assert.deepEqual(a.warnings, ["guardian_no_email"]);
  assert.equal(b.merged, true); // "Jenda Novák" merged into Jan Novák by hand
  assert.equal(b.participant?.id, "p1");
  assert.ok(!b.changes.some((c) => c.field === "Name")); // a merged row never renames the person
}
// Old positional guardian columns -> explicit slots; column types guessed for "new field from column".
assert.deepEqual(slotMapping(["E-mail 1", "Rodič", "E-mail 2", "X"], { "E-mail 1": "Email", "Rodič": "zak_zast_jmeno", "E-mail 2": "Email", X: "alergie" }).X, "alergie");
{
  const m = slotMapping(["a", "b"], { a: "Email", b: "Email" });
  assert.deepEqual(Object.values(m).map((v) => v.replace(/_.*/, "")), ["guardian1", "guardian2"]);
}
assert.deepEqual(guessType(["ano", "ne", "Ano"]), { fieldType: "boolean" });
assert.deepEqual(guessType(["S", "M", "S", "L", "M", "S"]), { fieldType: "select", options: ["S", "M", "L"] });
assert.equal(guessType(["1. 2. 2015", "2015-03-04"]).fieldType, "date");
assert.equal(guessType(["Novák, Praha", "Malá, Brno"]).fieldType, "text");
// The new import's guess: a header that IS a field's name wins over keyword guesses (use-case test 2026-11-24).
{
  const fs2: FieldInfo[] = [...fields, { key: "oddil", label: "Oddíl / členství ve skupině", kind: "custom", fieldType: "select" }, { key: "kontaktni_email_ditete", label: "Kontaktní email dítěte (pokud používá, nepovinné)", kind: "custom", fieldType: "email" }];
  const m = guessMappingByLabel(["Oddíl / členství ve skupině", "Kontaktní email dítěte (pokud používá, nepovinné)", "E-mail zákonného zástupce"], fs2);
  assert.equal(m["Oddíl / členství ve skupině"], "oddil");
  assert.equal(m["Kontaktní email dítěte (pokud používá, nepovinné)"], "kontaktni_email_ditete");
  assert.equal(m["E-mail zákonného zástupce"], "Email"); // keyword guess where no field has that name
}
console.log("participant-sync ok");
