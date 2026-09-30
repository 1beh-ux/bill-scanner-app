// Self-check for composite ("Složené pole") fields: `npx tsx src/lib/participant-fields.check.ts`
import assert from "node:assert/strict";
import { composeValue, readComposite, sanitizeComposite } from "@/lib/participant-fields";

const values: Record<string, string> = { ulice: "Hlavní 5 ", mesto: "Brno", psc: "", Name: "Eva Malá" };
assert.equal(composeValue({ parts: ["ulice", "psc", "mesto"], separator: ", " }, (k) => values[k]), "Hlavní 5, Brno"); // empty part skipped
assert.equal(composeValue(readComposite(null), (k) => values[k]), "");
assert.deepEqual(readComposite({ parts: ["a", 3, "b"], separator: 7 }), { parts: ["a", "b"], separator: " " });
assert.deepEqual(
  sanitizeComposite({ parts: ["ulice", "self", "nope", "ulice", "mesto"], separator: "x".repeat(30) }, new Set(["ulice", "mesto", "self"]), "self"),
  { parts: ["ulice", "mesto"], separator: "x".repeat(20) }
);
console.log("participant-fields ok");
