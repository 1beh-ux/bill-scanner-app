// Self-check for the pure parts of field renaming: `npx tsx src/lib/field-rename.check.ts` (invented keys)
import assert from "node:assert/strict";
import { FIELD_KEY, moveValue, swapKey } from "@/lib/field-rename";

// Saved settings: exact strings, "f:" sort keys, object keys and nested fieldKey; nothing else.
const cfg = { columns: ["pojistovna", "Name", "pojistovna_2"], layout: { detail: { sections: [{ fields: ["pojistovna", "x"] }] } }, notes: [{ fieldKey: "pojistovna", places: ["list"] }], sort: "f:pojistovna", byKey: { pojistovna: 1, jine: 2 }, label: "Pojišťovna" };
const [out, hits] = swapKey(cfg, "pojistovna", "zdravotni_pojistovna");
assert.equal(hits, 5);
assert.deepEqual(out, { columns: ["zdravotni_pojistovna", "Name", "pojistovna_2"], layout: { detail: { sections: [{ fields: ["zdravotni_pojistovna", "x"] }] } }, notes: [{ fieldKey: "zdravotni_pojistovna", places: ["list"] }], sort: "f:zdravotni_pojistovna", byKey: { zdravotni_pojistovna: 1, jine: 2 }, label: "Pojišťovna" });
assert.deepEqual(swapKey(null, "a", "b"), [null, 0]);
assert.deepEqual(swapKey({ parts: ["ulice", "mesto"], separator: ", " }, "mesto", "obec"), [{ parts: ["ulice", "obec"], separator: ", " }, 1]);

// Values: moved; the renamed field's value wins over a stray one; untouched maps report null.
assert.deepEqual(moveValue({ a: "1", b: "x" }, "a", "c"), { b: "x", c: "1" });
assert.deepEqual(moveValue({ a: "1", c: "stray" }, "a", "c"), { c: "1" });
assert.equal(moveValue({ b: "x" }, "a", "c"), null);
assert.equal(moveValue(null, "a", "c"), null);
// Undo = the same move back.
assert.deepEqual(moveValue(moveValue({ a: "1", b: "x" }, "a", "c"), "c", "a"), { b: "x", a: "1" });

assert.ok(FIELD_KEY.test("zdravotni_pojistovna") && FIELD_KEY.test("Name") && !FIELD_KEY.test("1abc") && !FIELD_KEY.test("a-b") && !FIELD_KEY.test(""));

console.log("field-rename: ok");
