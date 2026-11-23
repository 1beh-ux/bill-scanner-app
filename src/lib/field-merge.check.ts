// Self-check for merging duplicate fields (pure part): `npx tsx src/lib/field-merge.check.ts`
import assert from "node:assert/strict";
import { mergeMap, typesCompatible, SUGGESTED_GROUPS, CODE_READERS } from "@/lib/field-merge";

// Target empty -> takes the first filled old value; old values stay (nothing deleted).
assert.deepEqual(mergeMap({ alergie: "pyl", allergies: "" }, ["alergie"], "allergies"), { next: { alergie: "pyl", allergies: "pyl" }, conflicts: [] });
// Both filled and different -> target kept, old value listed.
assert.deepEqual(mergeMap({ alergie: "pyl", allergies: "prach" }, ["alergie"], "allergies"), { next: null, conflicts: [{ key: "alergie", value: "pyl" }] });
// Same value (spaces aside) -> nothing to do, no conflict.
assert.deepEqual(mergeMap({ alergie: " pyl", allergies: "pyl" }, ["alergie"], "allergies"), { next: null, conflicts: [] });
// Two old keys: the first filled fills, the second differing one is a conflict.
assert.deepEqual(mergeMap({ a: "", b: "x", c: "y" }, ["b", "c"], "a"), { next: { a: "x", b: "x", c: "y" }, conflicts: [{ key: "c", value: "y" }] });
assert.deepEqual(mergeMap(null, ["a"], "b"), { next: null, conflicts: [] });
assert.ok(typesCompatible("text", "longtext") && !typesCompatible("text", "select") && typesCompatible("select", "select"));
// The agreed targets are the keys code reads directly.
for (const g of SUGGESTED_GROUPS) assert.ok(CODE_READERS[g.target], g.id);
console.log("field-merge ok");
export {};
