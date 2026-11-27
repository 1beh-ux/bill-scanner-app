// Self-check: template text variants round trip and render (2026-11-27). npx tsx src/lib/email-conditions.check.ts
import assert from "node:assert/strict";
import { docConditionKey, readVariants, writeVariants } from "@/lib/email-conditions";
import { substituteVariables } from "@/lib/email-template";
const cond = docConditionKey("2ba52d26-2d3a-4bf5-8282-202bf3084b0f");
assert.equal(cond, "has_doc_2ba52d262d3a4bf58282202bf3084b0f");
const v = { cond, yes: "Dobrý den {{name}},\\nlist už máme.", no: "Dobrý den {{name}},\\nv příloze je list." };
const body = writeVariants(v);
assert.deepEqual(readVariants(body), v);
assert.equal(readVariants("jen text"), null);
assert.equal(substituteVariables(body, { [cond]: "ano", name: "Eva" }).trim(), "Dobrý den Eva,\\nlist už máme.");
assert.equal(substituteVariables(body, { [cond]: "", name: "Eva" }).trim(), "Dobrý den Eva,\\nv příloze je list.");
console.log("email-conditions ok");
