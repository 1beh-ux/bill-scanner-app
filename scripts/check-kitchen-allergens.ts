// Self-check for the allergen text mapping and the conflict engine (src/lib/kitchen/allergens.ts).
// npx tsx scripts/check-kitchen-allergens.ts
import assert from "node:assert/strict";
import { entryConflicts, mapAllergyText, type IngredientInfo } from "../src/lib/kitchen/allergens";

// Czech samples, diacritics-insensitive; nothing is dropped.
assert.deepEqual(mapAllergyText("ořechy, lepek"), { allergens: ["gluten", "nuts"], dietFlags: [], unmapped: [] });
assert.deepEqual(mapAllergyText("Laktóza"), { allergens: ["milk"], dietFlags: [], unmapped: [] });
assert.deepEqual(mapAllergyText("laktoza a orechy").allergens, ["milk", "nuts"]);
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
const amber = entryConflicts([{ ingredientId: "tomato", qty: 1 }, { ingredientId: "sauce", qty: 1 }], unsure, [], [], [people[3]]);
assert.equal(amber.level, "amber");
assert.deepEqual(amber.unconfirmedIngredients, ["sauce"]);
console.log("kitchen allergens ok");
