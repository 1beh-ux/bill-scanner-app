// Self-check for calculated fields: `npx tsx src/lib/field-calc.check.ts` (invented values only)
import assert from "node:assert/strict";
import { ageAt, calcDeps, evaluateCalc, parseLooseDate, readCalcSpec, SEPARATOR_PRESETS, type CalcSpec } from "@/lib/field-calc";
import { composeValue, readComposite } from "@/lib/participant-fields";

const vals: Record<string, string> = {
  ulice: "Smyšlená 7",
  psc: "999 01",
  mesto: "Testov",
  prazdne: "",
  datum_narozeni: "05.03.2015",
  plavec: "ano",
  oddil: "Vzorový",
  jmeno: "Kvido",
};
const ctx = { valueOf: (k: string) => vals[k], eventStart: new Date(Date.UTC(2027, 6, 3)), today: new Date(Date.UTC(2026, 10, 21)) };

// Old composite fields read as join / template and give exactly composeValue's output.
const compJoin = { parts: ["ulice", "prazdne", "psc", "mesto"], separator: ", " };
const specJoin = readCalcSpec("composite", compJoin)!;
assert.deepEqual(specJoin, { kind: "join", parts: ["ulice", "prazdne", "psc", "mesto"], separator: ", " });
assert.equal(evaluateCalc(specJoin, ctx), composeValue(readComposite(compJoin), ctx.valueOf));
assert.equal(evaluateCalc(specJoin, ctx), "Smyšlená 7, 999 01, Testov");
const compTpl = { parts: [], separator: " ", template: "{{jmeno}}{{#plavec}} (plavec){{/plavec}}{{^plavec}} (neplavec){{/plavec}}" };
const specTpl = readCalcSpec("composite", compTpl)!;
assert.equal(specTpl.kind, "template");
assert.equal(evaluateCalc(specTpl, ctx), composeValue(readComposite(compTpl), ctx.valueOf));
assert.equal(evaluateCalc(specTpl, ctx), "Kvido (plavec)");

// Every separator preset.
for (const sep of SEPARATOR_PRESETS) {
  assert.equal(evaluateCalc({ kind: "join", parts: ["psc", "mesto"], separator: sep }, ctx), `999 01${sep}Testov`);
}

// Not calculated / unknown kinds.
assert.equal(readCalcSpec("text", { kind: "join" }), null);
assert.equal(readCalcSpec("calculated", { kind: "nope" }), null);
assert.equal(readCalcSpec("calculated", { kind: "builtin", id: "nope" }), null);
assert.deepEqual(readCalcSpec("calculated", { kind: "builtin", id: "price" }), { kind: "builtin", id: "price" });

// Age: at event start (default), today, a fixed date; invalid or future birth dates give "".
const age = (asOf: unknown, src = "datum_narozeni") => evaluateCalc(readCalcSpec("calculated", { kind: "age", source: src, asOf })!, ctx);
assert.equal(age(undefined), "12"); // 5. 3. 2015 -> 3. 7. 2027
assert.equal(age("today"), "11"); // -> 21. 11. 2026
assert.equal(age({ date: "2025-03-04" }), "9"); // one day before the 10th birthday
assert.equal(age({ date: "2025-03-05" }), "10");
assert.equal(age(undefined, "jmeno"), "");
assert.equal(age({ date: "2010-01-01" }), "");
assert.equal(ageAt(new Date(Date.UTC(2016, 1, 29)), new Date(Date.UTC(2027, 1, 28))), 10); // leap-day birthday
assert.equal(parseLooseDate("31. 2. 2015"), null);
assert.equal(parseLooseDate("1. 9. 2015")?.toISOString().slice(0, 10), "2015-09-01");
assert.equal(parseLooseDate("2015-09-01")?.toISOString().slice(0, 10), "2015-09-01");

// If-then-else.
const ifv = (test: unknown, src: string) => evaluateCalc(readCalcSpec("calculated", { kind: "if", source: src, test, then: "ANO", else: "NE" })!, ctx);
assert.equal(ifv("filled", "mesto"), "ANO");
assert.equal(ifv("filled", "prazdne"), "NE");
assert.equal(ifv("yes", "plavec"), "ANO");
assert.equal(ifv("yes", "mesto"), "NE");
assert.equal(ifv({ equals: "vzorový" }, "oddil"), "ANO"); // case-insensitive
assert.equal(ifv({ equals: "Jiný" }, "oddil"), "NE");

// Builtins come from the caller; missing = "".
const b: CalcSpec = { kind: "builtin", id: "price" };
assert.equal(evaluateCalc(b, { ...ctx, builtin: (id) => (id === "price" ? "4500 Kč" : "") }), "4500 Kč");
assert.equal(evaluateCalc(b, ctx), "");

// Dependencies.
assert.deepEqual(calcDeps(specJoin), ["ulice", "prazdne", "psc", "mesto"]);
assert.deepEqual(calcDeps(specTpl), ["jmeno", "plavec"]);
assert.deepEqual(calcDeps({ kind: "age", source: "datum_narozeni", asOf: "event_start" }), ["datum_narozeni"]);
assert.deepEqual(calcDeps(b), []);

console.log("field-calc: ok");
