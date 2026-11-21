// Self-check for the Fields Manager field types in answer validation (phase 3c): `npx tsx src/lib/field-types.check.ts`
import assert from "node:assert/strict";
import { cleanFieldValue } from "@/lib/registration-fields";

const F = (fieldType: string, options: unknown = null) => ({ fieldType, options });
// Consent behaves like yes/no.
assert.equal(cleanFieldValue(F("consent"), "true"), "true");
assert.equal(cleanFieldValue(F("consent"), "nonsense"), "false");
assert.equal(cleanFieldValue(F("consent"), ""), "");
// Several choices: listed options only, deduplicated, one per line.
const opts = ["plavání", "výlety", "hry"];
assert.equal(cleanFieldValue(F("multi", opts), "plavání\nhry\nplavání\n"), "plavání\nhry");
assert.equal(cleanFieldValue(F("multi", opts), "plavání\nlety"), null);
assert.equal(cleanFieldValue(F("multi", []), "cokoli\njiného"), "cokoli\njiného"); // no list = free items
// E-mail and phone formats.
assert.equal(cleanFieldValue(F("email"), "rodic@example.invalid"), "rodic@example.invalid");
assert.equal(cleanFieldValue(F("email"), "rodic@"), null);
assert.equal(cleanFieldValue(F("phone"), "+420 999 123 456"), "+420 999 123 456");
assert.equal(cleanFieldValue(F("phone"), "volat večer"), null);
// Long text: as text; unchanged types unchanged.
assert.equal(cleanFieldValue(F("longtext"), "  řádek 1\nřádek 2 "), "řádek 1\nřádek 2");
assert.equal(cleanFieldValue(F("boolean"), "true"), "true");
assert.equal(cleanFieldValue(F("select", ["A"]), "B"), null);

console.log("field-types: ok");
