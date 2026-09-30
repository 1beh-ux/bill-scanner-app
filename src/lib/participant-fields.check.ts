// Self-check for composite ("Složené pole") fields: `npx tsx src/lib/participant-fields.check.ts`
import assert from "node:assert/strict";
import { composeValue, formatFieldValue, readComposite, sanitizeComposite, toBoolean } from "@/lib/participant-fields";

const values: Record<string, string> = { ulice: "Hlavní 5 ", mesto: "Brno", psc: "", Name: "Eva Malá" };
assert.equal(composeValue({ parts: ["ulice", "psc", "mesto"], separator: ", " }, (k) => values[k]), "Hlavní 5, Brno"); // empty part skipped
assert.equal(composeValue(readComposite(null), (k) => values[k]), "");
assert.deepEqual(readComposite({ parts: ["a", 3, "b"], separator: 7 }), { parts: ["a", "b"], separator: " " });
assert.deepEqual(
  sanitizeComposite({ parts: ["ulice", "self", "nope", "ulice", "mesto"], separator: "x".repeat(30) }, new Set(["ulice", "mesto", "self"]), "self"),
  { parts: ["ulice", "mesto"], separator: "x".repeat(20) }
);
// Ano/Ne: defaults, the field's own lists (which win), unknown values stay unknown.
assert.deepEqual(["Ano", " ANO ", "x", "1", "true", "Ne", "0", "false", "", "možná"].map((v) => toBoolean(v)), ["true", "true", "true", "true", "true", "false", "false", "false", null, null]);
const opts = { trueValues: ["člen", "0"], falseValues: ["nečlen"] };
assert.deepEqual(["Člen", "nečlen", "0", "možná"].map((v) => toBoolean(v, opts)), ["true", "false", "true", null]);
assert.deepEqual(["Ano", "Ne", "možná", ""].map((v) => formatFieldValue(v, "boolean")), ["Ano", "Ne", "možná (?)", "—"]);
console.log("participant-fields ok");
