// Self-check for the allergen text mapping and the conflict engine (src/lib/kitchen/allergens.ts).
// npx tsx scripts/check-kitchen-allergens.ts
import assert from "node:assert/strict";
import { entryConflicts, mapAllergyText, type IngredientInfo } from "../src/lib/kitchen/allergens";

// Czech samples, diacritics-insensitive; nothing is dropped.
assert.deepEqual(mapAllergyText("ořechy, lepek"), { allergens: ["gluten", "nuts"], dietFlags: [], unmapped: [] });
assert.deepEqual(mapAllergyText("Laktóza"), { allergens: [], dietFlags: ["lactose_free"], unmapped: [] }, "an intolerance, not the milk allergy");
assert.deepEqual(mapAllergyText("laktoza a orechy"), { allergens: ["nuts"], dietFlags: ["lactose_free"], unmapped: [] });
assert.deepEqual(mapAllergyText("mléko"), { allergens: ["milk"], dietFlags: [], unmapped: [] });
assert.deepEqual(mapAllergyText("bezlepková dieta").dietFlags, ["gluten_free"]);
// The organization's own diet: its keywords map, its allergens / contents conflict.
const custom = [{ code: "bez_hub", name: "bez hub", keywords: ["houb"], contents: ["mushroom"], allergens: [] }];
assert.deepEqual(mapAllergyText("nesnáší houby", custom), { allergens: [], dietFlags: ["bez_hub"], unmapped: [] });
assert.deepEqual(mapAllergyText("bez vepřového"), { allergens: [], dietFlags: ["no_pork"], unmapped: [] });
assert.deepEqual(mapAllergyText("nesnáší houby"), { allergens: [], dietFlags: [], unmapped: ["nesnáší houby"] });
assert.deepEqual(mapAllergyText("alergie na pyl"), { allergens: [], dietFlags: [], unmapped: ["alergie na pyl"] });
const ana = mapAllergyText("arašídy – anafylaxe");
assert.deepEqual(ana.allergens, ["peanuts"]);
assert.deepEqual(ana.unmapped, ["arašídy – anafylaxe"], "severity stays for a human");
assert.deepEqual(mapAllergyText("nemá alergii").unmapped, ["nemá alergii"], "negation is never read as an allergy");
assert.deepEqual(mapAllergyText("rybíz").allergens, [], "rybíz is no fish");
assert.deepEqual(mapAllergyText("vegan").dietFlags, ["vegan"]);

// Conflicts: vegan vs dairy, a gluten-free variant clears gluten, unconfirmed ingredient -> amber (unknown).
const ing = (id: string, allergens: string[], dietFlags: string[] = [], allergensConfirmed = true): IngredientInfo => ({ id, name: id, allergens, dietFlags, allergensConfirmed });
const ingredients = new Map([ing("pasta", ["gluten"]), ing("gfpasta", []), ing("cheese", ["milk"], ["dairy"]), ing("tomato", [])].map((i) => [i.id, i]));
const lines = [{ ingredientId: "pasta", qty: 100 }, { ingredientId: "cheese", qty: 20 }, { ingredientId: "tomato", qty: 50 }];
const variants = [{ id: "gf", name: "bezlepková", clearsAllergens: [], swaps: [{ fromIngredientId: "pasta", toIngredientId: "gfpasta" }] }];
const people = [
  { key: "a", name: "Anna", allergens: ["gluten"], dietFlags: [], status: "confirmed" as const },
  { key: "b", name: "Bára", allergens: [], dietFlags: ["vegan"], status: "confirmed" as const },
  { key: "c", name: "Cyril", allergens: [], dietFlags: [], status: "unverified" as const },
  { key: "d", name: "Dan", allergens: [], dietFlags: [], status: "none" as const },
];
const r = entryConflicts(lines, ingredients, variants, [], people);
assert.deepEqual(r.allergens, ["gluten", "milk"]);
assert.deepEqual(r.specialPortions, [{ variantId: "gf", variantName: "bezlepková", applied: false, names: ["Anna"] }]);
assert.deepEqual(r.noVariant, ["Bára"], "no variant removes the cheese for the vegan");
assert.equal(r.level, "red");
assert.equal(r.unverifiedPeople, 1);
// With the variant applied, Anna gets a special portion and nobody is left uncovered.
const withGf = entryConflicts(lines, ingredients, variants, ["gf"], people);
assert.deepEqual(withGf.specialPortions, [{ variantId: "gf", variantName: "bezlepková", applied: true, names: ["Anna"] }]);
assert.ok(!withGf.uncovered.includes("Anna"));
// An ingredient whose allergens nobody confirmed: amber, never clear.
const unsure = new Map([...ingredients, ["sauce", ing("sauce", [], [], false)]]);
// "bez laktózy": milk breaks it, lactose-free milk (marked ok:lactose_free) doesn't; a variant can swap it in.
const milkIng = new Map([ing("milk", ["milk"], ["dairy"]), { ...ing("lfmilk", ["milk"], ["dairy", "ok:lactose_free"]) }, ing("oats", [])].map((i) => [i.id, i]));
const lf = [{ key: "l", name: "Lea", allergens: [], dietFlags: ["lactose_free"], status: "confirmed" as const }];
const lfVar = [{ id: "lf", name: "bez laktózy", clearsAllergens: [], swaps: [{ fromIngredientId: "milk", toIngredientId: "lfmilk" }] }];
const porridge = entryConflicts([{ ingredientId: "oats", qty: 50 }, { ingredientId: "milk", qty: 200 }], milkIng, lfVar, ["lf"], lf);
assert.deepEqual(porridge.conflicts.map((c) => [c.name, c.diets, c.variantId]), [["Lea", ["lactose_free"], "lf"]]);
assert.equal(porridge.level, "ok");
const amber = entryConflicts([{ ingredientId: "tomato", qty: 1 }, { ingredientId: "sauce", qty: 1 }], unsure, [], [], [people[3]]);
assert.equal(amber.level, "amber");
assert.deepEqual(amber.unconfirmedIngredients, ["sauce"]);
console.log("kitchen allergens ok");
