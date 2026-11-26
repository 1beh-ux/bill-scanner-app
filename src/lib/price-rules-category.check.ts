// Self-check: the price category by the Oddíl answer (2026-11-26). npx tsx src/lib/price-rules-category.check.ts
import assert from "node:assert/strict";
import { categoryFromAnswer, derivesCategory, readPriceRules } from "@/lib/price-rules";
import { validateSubmission } from "@/lib/public-registration";

const rules = readPriceRules({
  categories: [
    { key: "oddil", label: "Dítě v oddíle", forChildren: true, forAdults: false, priceCzk: 1300 },
    { key: "ostatni", label: "Ostatní", forChildren: true, forAdults: true, priceCzk: 500 },
  ],
  oddilFieldKey: "oddil",
  categoryMap: { Dráčci: "oddil", "Mimo oddíly": "ostatni", Bad: "nonexistent" },
  categoryShow: "hidden",
})!;
assert.ok(derivesCategory(rules));
assert.deepEqual(rules.categoryMap, { Dráčci: "oddil", "Mimo oddíly": "ostatni" }); // unknown category dropped
assert.equal(rules.categoryShow, "hidden");
assert.equal(categoryFromAnswer(rules, "Dráčci", false)?.key, "oddil");
assert.equal(categoryFromAnswer(rules, "Dráčci", true)?.key, "ostatni"); // children's category -> adult's first allowed
assert.equal(categoryFromAnswer(rules, "", false)?.key, "oddil"); // no answer -> first allowed
assert.equal(derivesCategory(readPriceRules({ ...rules, categoryMap: {} })), false);

// The public form: the category follows the answer, whatever category was sent.
const field = { key: "oddil", label: "Oddíl", fieldType: "select", options: ["Dráčci", "Mimo oddíly"], required: true };
const ctx = { fields: [field], rules, oddil: { key: "oddil", options: ["Dráčci", "Mimo oddíly"] }, today: new Date("2026-11-26") };
const v = validateSubmission({ persons: [{ firstName: "A", lastName: "B", birthDate: "2017-01-01", values: { oddil: "Mimo oddíly" }, category: "oddil" }], guardians: [{ name: "M", email: "m@example.invalid" }] }, ctx);
assert.ok(v.ok && v.data.persons[0].category === "ostatni", JSON.stringify(v));
console.log("price-rules-category ok");
