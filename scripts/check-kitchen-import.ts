// Self-check for the recipe import normalizer (src/lib/kitchen/import-normalize.ts). npx tsx scripts/check-kitchen-import.ts
import assert from "node:assert/strict";
import { convertUnit, matchIngredient, nameKey, normalizeRecipe, toNumber } from "../src/lib/kitchen/import-normalize";

assert.equal(nameKey("  Mouka   Hladká "), "mouka hladka");
assert.equal(toNumber("1,5"), 1.5);
assert.equal(toNumber("1/2"), 0.5);
assert.equal(toNumber("abc"), null);
assert.deepEqual(convertUnit(2, "kg"), { qty: 2000, unit: "g", estimated: false });
assert.deepEqual(convertUnit(25, "dkg"), { qty: 250, unit: "g", estimated: false });
assert.deepEqual(convertUnit(3, "dl"), { qty: 300, unit: "ml", estimated: false });
assert.deepEqual(convertUnit(2, "lžíce"), { qty: 30, unit: "ml", estimated: true });
assert.deepEqual(convertUnit(1, "PL."), { qty: 15, unit: "ml", estimated: true });
assert.equal(convertUnit(1, "plechovka"), null);

const known = [
  { id: "i1", name: "Mouka hladká", nameKey: "mouka hladka", unit: "g" as const },
  { id: "i2", name: "Mléko", nameKey: "mleko", unit: "ml" as const },
  { id: "i3", name: "Mrkev", nameKey: "mrkev", unit: "g" as const },
  { id: "i4", name: "Česnek", nameKey: "cesnek", unit: "ks" as const, altUnitName: "stroužek", altUnitQty: 1 },
  { id: "i5", name: "Hladká mouka", nameKey: "hladka mouka", unit: "g" as const, altUnitName: "hrnek", altUnitQty: 140 },
  { id: "i6", name: "Sůl", nameKey: "sul", unit: "g" as const, pantry: true },
];
assert.equal(matchIngredient("MOUKA hladká", known).match?.id, "i1");
assert.equal(matchIngredient("mrkev čerstvá", known).match?.id, "i3");
assert.equal(matchIngredient("mrkev čerstvá", known).exact, false);
assert.equal(matchIngredient("cukr", known).match, null);

const r = normalizeRecipe(
  {
    name: " Palačinky ",
    servings: "20",
    ingredients: [
      { name: "mouka hladká", qty: 2, unit: "kg" },
      { name: "mléko", qty: "4", unit: "l" },
      { name: "cukr", qty: 2, unit: "lžíce" },
      { name: "mrkev", qty: 3, unit: "plechovka" },
      { name: "pepř", qty: null, unit: null },
      { name: "  ", qty: 1, unit: "g" },
    ],
    steps: ["Smíchat.", "Péct."],
  },
  known
);
assert.equal(r.name, "Palačinky");
assert.equal(r.servings, 20);
assert.equal(r.lines.length, 5, "blank names dropped");
assert.deepEqual([r.lines[0].ingredientId, r.lines[0].qtyPerAdultPortion, r.lines[0].unit], ["i1", 100, "g"]);
assert.deepEqual([r.lines[1].qtyPerAdultPortion, r.lines[1].unit], [200, "ml"]);
assert.deepEqual(r.lines[2].warnings, ["estimated_unit", "new_ingredient"]);
assert.equal(r.lines[2].qtyPerAdultPortion, 1.5);
assert.deepEqual([r.lines[3].unit, r.lines[3].qtyPerAdultPortion, r.lines[3].warnings], ["ks", 0.15, ["piece_unit", "unit_mismatch"]], "an unknown unit = pieces of it; carrots are in g -> warn");
assert.ok(r.lines[4].warnings.includes("no_qty") && !r.lines[4].pantry);
assert.equal(r.steps, "Smíchat.\nPéct.");
const m = normalizeRecipe({ name: "x", servings: null, ingredients: [{ name: "mléko", qty: 100, unit: "g" }] }, known);
assert.ok(m.servingsGuessed && m.servings === 10);
assert.ok(m.lines[0].warnings.includes("unit_mismatch") && m.lines[0].unit === "g", "g vs ml: keep the import's unit, warn");
// The ingredient's own second unit is exact; a pantry item needs no amount; a new piece-type unit is kept.
const g = normalizeRecipe(
  {
    name: "Guláš",
    servings: 10,
    ingredients: [
      { name: "česnek", qty: 5, unit: "stroužky" },
      { name: "hladká mouka", qty: 1, unit: "hrnek" },
      { name: "sůl", qty: null, unit: null },
      { name: "kmín", qty: null, unit: null, pantry: true },
      { name: "rajčata", qty: 2, unit: "plechovka" },
    ],
    prep_minutes: "20",
    tags: ["masité", " "],
    variants: [{ name: "bezlepková", swaps: [{ from: "Hladká mouka", to: "bezlepková mouka" }, { from: "nic", to: "x" }] }],
  },
  known
);
assert.deepEqual([g.lines[0].qtyPerAdultPortion, g.lines[0].unit, g.lines[0].warnings], [0.5, "ks", []]);
assert.deepEqual([g.lines[1].qtyPerAdultPortion, g.lines[1].warnings], [14, []]);
assert.deepEqual([g.lines[2].pantry, g.lines[2].qtyPerAdultPortion, g.lines[2].warnings], [true, 0, []]);
assert.deepEqual([g.lines[3].pantry, g.lines[3].qtyPerAdultPortion], [true, 0]);
assert.deepEqual([g.lines[4].unit, g.lines[4].altUnitName, g.lines[4].qtyPerAdultPortion], ["ks", "plechovka", 0.2]);
assert.equal(g.prepMinutes, 20);
assert.deepEqual(g.tags, ["masité"]);
assert.deepEqual(g.variants, [{ name: "bezlepková", swaps: [{ fromLine: 1, toName: "bezlepková mouka", toIngredientId: null }] }]);
console.log("kitchen import ok");
