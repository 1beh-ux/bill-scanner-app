// U5 (audit 2026-11-05): the audit's import headers map to the right targets. npx tsx scripts/check-participant-import-headers.ts
import assert from "node:assert/strict";
import { DOB_FIELD, FIRST_NAME_FIELD, GUARDIAN_EMAIL_FIELD, GUARDIAN_NAME_FIELD, GUARDIAN_PHONE_FIELD, LAST_NAME_FIELD, NAME_FIELD, guessMapping, guessTarget, type FieldInfo } from "../src/lib/participant-sync";

const fields = [{ key: "alergie", label: "Alergie", kind: "custom", fieldType: "text" }] as unknown as FieldInfo[];
const headers = ["Jméno", "Příjmení", "Datum narození", "E-mail zákonného zástupce", "Telefon", "Alergie"];
assert.deepEqual(guessMapping(headers, fields), {
  "Jméno": FIRST_NAME_FIELD,
  "Příjmení": LAST_NAME_FIELD,
  "Datum narození": DOB_FIELD,
  "E-mail zákonného zástupce": GUARDIAN_EMAIL_FIELD,
  "Telefon": GUARDIAN_PHONE_FIELD,
  "Alergie": "alergie",
});
// A lone "Jméno" (no Příjmení column) stays the combined name.
assert.equal(guessMapping(["Jméno", "Datum narození"], fields)["Jméno"], NAME_FIELD);
// No e-mail header ever maps to a name field.
for (const h of ["E-mail", "Email rodiče", "E-mail zákonného zástupce", "Jméno e-mail", "Mail matky"]) {
  const g = guessTarget(h, fields);
  assert.ok(![NAME_FIELD, FIRST_NAME_FIELD, LAST_NAME_FIELD, GUARDIAN_NAME_FIELD].includes(g), `${h} -> ${g}`);
}
assert.equal(guessTarget("Jméno zákonného zástupce", fields), GUARDIAN_NAME_FIELD);
console.log("check-participant-import-headers: all passed");
