// Self-check for merging duplicate fields (pure part): `npx tsx src/lib/field-merge.check.ts`
import assert from "node:assert/strict";
import { looksDuplicate, mergeMap, pairKey, partsOf, typesCompatible, SUGGESTED_GROUPS, CODE_READERS } from "@/lib/field-merge";

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
// Duplicate proposals: alike labels / keys / known pairs, compatible types only.
const f = (key: string, label: string, fieldType = "text") => ({ key, label, fieldType });
assert.ok(looksDuplicate(f("allergies", "Alergie"), f("alergie", "Alergie dítěte"))); // known pair
assert.ok(looksDuplicate(f("chronicIssues", "Chronic issues"), f("chronicka_onemocneni", "Chronická onemocnění")));
assert.ok(looksDuplicate(f("poznamka", "Poznámka rodiče"), f("poznamka_rodice", "Poznámka od rodiče"))); // near label
assert.ok(!looksDuplicate(f("tricko", "Velikost trička", "select"), f("vyska_cm", "Výška", "number")));
assert.ok(!looksDuplicate(f("mesto", "Město"), f("psc", "PSČ")));
assert.ok(!looksDuplicate(f("alergie", "Alergie"), f("allergies", "Alergie", "select"))); // type differs
assert.equal(pairKey(["b", "a"]), "a|b");
assert.deepEqual(partsOf({ kind: "age", source: "datum_narozeni", asOf: "event_start" }), ["datum_narozeni"]);
console.log("field-merge ok");
export {};
