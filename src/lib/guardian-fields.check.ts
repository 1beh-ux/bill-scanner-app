// Self-check for guardian fields, form place/order and the import of own guardian fields (2026-11-26):
//   npx tsx src/lib/guardian-fields.check.ts
import assert from "node:assert/strict";
import { cleanGuardianExtra, guardianQuestions, missingGuardianAnswers, readGuardianForm, readGuardianSettings } from "@/lib/guardian-fields";
import { guardianSlotValues, parseGuardianKey } from "@/lib/field-resolver";
import { applyFormChange, readFormConfig } from "@/lib/form-config";
import { askedFields } from "@/lib/registration-fields";
import { planSync, MATCH_BY_NAME, type FieldInfo } from "@/lib/participant-sync";
import { validateSubmission } from "@/lib/public-registration";

// Settings: unknown / fixed / duplicate keys dropped, options only for choices.
const s = readGuardianSettings({
  fixedRequired: { phone: true },
  fields: [
    { key: "souhlas", label: "Souhlas", fieldType: "consent", required: true },
    { key: "phone", label: "x", fieldType: "text" },
    { key: "souhlas", label: "dup", fieldType: "text" },
    { key: "Bad-Key", label: "x", fieldType: "text" },
    { key: "zamestnani", label: "Zaměstnání", fieldType: "select", options: ["A", " B ", ""] },
  ],
});
assert.deepEqual(s.fields.map((f) => f.key), ["souhlas", "zamestnani"]);
assert.deepEqual(s.fields[1].options, ["A", "B"]);
assert.deepEqual(s.fixedRequired, { phone: true, relationship: false });

// Questions: organization defaults, an event's own setting wins, fixed ones always asked.
const form = readGuardianForm({ souhlas: { required: false, label: "Souhlasím" }, phone: { ask: false }, zamestnani: { ask: false } });
const qs = guardianQuestions(s, form, { phone: "Telefon", relationship: "Vztah" });
const q = (k: string) => qs.find((x) => x.key === k)!;
assert.equal(q("phone").ask, true); // fixed: can't be switched off
assert.equal(q("phone").required, true);
assert.equal(q("souhlas").required, false);
assert.equal(q("souhlas").requiredDefault, true);
assert.equal(q("souhlas").label, "Souhlasím");
assert.equal(q("zamestnani").ask, false);

// Values: cleaned by type; a bad option is invalid; a required consent must be "true".
assert.deepEqual(cleanGuardianExtra(s.fields, { souhlas: "true", zamestnani: "B", other: "x" }), { souhlas: "true", zamestnani: "B" });
assert.equal(cleanGuardianExtra(s.fields, { zamestnani: "C" }), null);
const strict = guardianQuestions(s, null, { phone: "", relationship: "" });
assert.deepEqual(missingGuardianAnswers(strict, { phone: "", extra: { souhlas: "false" } }), ["phone", "souhlas"]);
assert.deepEqual(missingGuardianAnswers(strict, { phone: "777", extra: { souhlas: "true" } }), []);

// Documents: guardian<N>_<own key>, Ano / Ne, slots beyond the guardians empty.
assert.deepEqual(parseGuardianKey("guardian2_souhlas", 2, ["souhlas"]), { slot: 2, prop: "souhlas" });
assert.equal(parseGuardianKey("guardian2_souhlas", 2), null);
const g = (name: string, extra: object) => ({ name, email: `${name}@example.invalid`, relationship: null, phone: null, receivesCommunications: true, extra });
const slots = guardianSlotValues([g("a", { souhlas: "true" }), g("b", { souhlas: "false", zamestnani: "A\nB" })], 3, ["souhlas", "zamestnani"]);
assert.equal(slots.guardian1_souhlas, "Ano");
assert.equal(slots.guardian2_souhlas, "Ne");
assert.equal(slots.guardian2_zamestnani, "A, B");
assert.equal(slots.guardian3_souhlas, "");

// Form place / order: read, changed, and askedFields follows the order set on the Formulář screen.
const cfg = readFormConfig({ ask: true, required: true, place: "person", order: 2 })!;
assert.equal(cfg.place, "person");
assert.deepEqual(Object.keys(applyFormChange(cfg, { place: "questions", order: null })).filter((k) => k === "place" || k === "order"), []);
const ef = (key: string, order: number | null) => ({ key, label: key, fieldType: "text", options: null, kind: "custom", active: true, requiredOnRegistration: true, formConfig: { ask: true, required: false, order } });
const asked = askedFields([ef("a", 3), ef("b", 1), ef("c", null), ef("d", 2)] as never, new Map());
assert.deepEqual(asked.map((f) => f.key), ["b", "d", "a", "c"]);

// Import: Zástupce 1 – souhlas goes into the guardian's extra.
const fields: FieldInfo[] = [{ key: "Name", label: "Jméno", kind: "builtin" }];
const plan = planSync({
  headers: ["Jméno", "E-mail 1", "Souhlas 1"],
  rows: [["Eva Malá", "m@example.invalid", "true"]],
  settings: { mapping: { "Jméno": "Name", "E-mail 1": "guardian1_email", "Souhlas 1": "guardian1_souhlas" }, matchBy: MATCH_BY_NAME, onNew: "create", onMatch: "fill", overrides: {}, excluded: [] },
  fields,
  existing: [],
  seenKeys: [],
});
assert.deepEqual(plan[0].create?.guardians[0].extra, { souhlas: "true" });

// Public form: a required guardian consent must be given, for a guardian row and an adult ticked as a guardian.
const ctx = { fields: [], rules: null, oddil: null, today: new Date("2026-11-26"), guardians: strict.filter((x) => x.ask) };
const child = { firstName: "Ema", lastName: "Malá", birthDate: "2017-01-01" };
const bad = validateSubmission({ persons: [child], guardians: [{ name: "M", email: "m@example.invalid", phone: "777" }] }, ctx);
assert.equal(bad.ok, false);
assert.ok(!bad.ok && bad.errors.includes("g0.souhlas"));
const good = validateSubmission({ persons: [child], guardians: [{ name: "M", email: "m@example.invalid", phone: "777", extra: { souhlas: "true" } }] }, ctx);
assert.ok(good.ok && good.data.persons[0].guardians[0].extra?.souhlas === "true");
const adult = validateSubmission({ persons: [{ ...child, firstName: "Petr", birthDate: "1980-01-01", isAdult: true, email: "p@example.invalid", phone: "777", guardianOfChildren: true, guardianExtra: { souhlas: "true" } }, child] }, ctx);
assert.ok(adult.ok && adult.data.persons[1].guardians[0].extra?.souhlas === "true", JSON.stringify(adult));

// Two different guardians with one e-mail: refused, not dropped; the same person twice is merged.
const twins = validateSubmission({ persons: [child], guardians: [{ name: "A", email: "x@example.invalid", phone: "777", extra: { souhlas: "true" } }, { name: "B", email: "X@example.invalid", phone: "777", extra: { souhlas: "true" } }] }, ctx);
assert.ok(!twins.ok && twins.errors.includes("g1.email_duplicate"));
const same = validateSubmission({ persons: [child], guardians: [{ name: "A", email: "x@example.invalid", phone: "777", extra: { souhlas: "true" } }, { name: "a", email: "x@example.invalid", phone: "777", extra: { souhlas: "true" } }] }, ctx);
assert.ok(same.ok);

console.log("guardian-fields ok");
