// Self-check for headcount and sizing (src/lib/kitchen/headcount.ts, sizing.ts). npx tsx scripts/check-kitchen-sizing.ts
import assert from "node:assert/strict";
const near = (a: number, b: number, m?: string) => assert.ok(Math.abs(a - b) < 1e-9, `${m ?? ""} ${a} != ${b}`);
import { bandFactor, headcount } from "../src/lib/kitchen/headcount";
import { formatQty, learnedMultiplier, scaledQty } from "../src/lib/kitchen/sizing";

const bands = [
  { ageFrom: 0, ageTo: 5, factor: 0.5 },
  { ageFrom: 6, ageTo: 9, factor: 0.7 },
  { ageFrom: 10, ageTo: 14, factor: 0.9 },
  { ageFrom: 15, ageTo: 17, factor: 1.0 },
  { ageFrom: 18, ageTo: null, factor: 1.1 },
];
assert.equal(bandFactor(bands, 5), 0.5);
assert.equal(bandFactor(bands, 6), 0.7);
assert.equal(bandFactor(bands, 40), 1.1);
assert.equal(bandFactor(bands, null), 1, "no birth date -> 1.0");

const base = { eventStart: "2026-07-01", eventEnd: "2026-07-10", bands, countOnlyAccepted: false };
const participants = [
  // 5 -> 6 on 2026-07-05: 0.5 before the birthday, 0.7 on it.
  { id: "p1", name: "Ema", dateOfBirth: "2020-07-05", active: true, accepted: true, absences: [] },
  { id: "p2", name: "Filip", dateOfBirth: null, active: true, accepted: false, absences: [{ date: "2026-07-05", slotId: "dinner" }] },
  { id: "p3", name: "Gustav", dateOfBirth: "2012-01-01", active: false, accepted: true, absences: [] },
];
const adults = [{ id: "a1", name: "Hana", dateOfBirth: "1990-01-01", eats: true, from: "2026-07-03", to: "2026-07-05", absences: [] }];
const adjusts = [{ from: "2026-07-05", to: "2026-07-05", slotId: "lunch", count: -1, factor: 1, label: "výlet bez oběda" }];

const d4 = headcount("2026-07-04", "lunch", { ...base, participants, adults, adjusts });
near(d4.portions, 0.5 + 1 + 1.1, "Ema 0.5, Filip without DOB 1.0, Hana 1.1; Gustav inactive");
assert.equal(d4.missingDob, 1);
assert.equal(d4.eaters, 3);
const lunch5 = headcount("2026-07-05", "lunch", { ...base, participants, adults, adjusts });
near(lunch5.portions, 0.7 + 1 + 1.1 - 1, "birthday counts; the trip removes one");
assert.equal(lunch5.extra, -1);
const dinner5 = headcount("2026-07-05", "dinner", { ...base, participants, adults, adjusts });
near(dinner5.portions, 0.7 + 1.1, "Filip away from dinner, the adjustment is for lunch only");
assert.equal(headcount("2026-07-06", "lunch", { ...base, participants, adults, adjusts }).adults, 0, "Hana left on the 5th");
assert.equal(headcount("2026-07-04", "lunch", { ...base, countOnlyAccepted: true, participants, adults, adjusts }).participants, 1, "only accepted");

// The learned multiplier: one 18 % leftover -> 0.94; nothing -> 1; three "short" -> above 1.
assert.equal(learnedMultiplier([{ verdict: "leftover", leftoverPercent: 18, shortPercent: null, eventId: "e1" }]).multiplier, 0.94);
assert.equal(learnedMultiplier([]).multiplier, 1);
const short = learnedMultiplier(["e1", "e1", "e2"].map((eventId) => ({ verdict: "short" as const, leftoverPercent: null, shortPercent: null, eventId })));
assert.ok(short.multiplier > 1 && short.events === 2 && short.samples === 3, JSON.stringify(short));
assert.equal(learnedMultiplier([{ verdict: "ok", leftoverPercent: null, shortPercent: null, eventId: "e" }]).multiplier, 1);

// Quantities and their display.
near(scaledQty(120, 87.5, 0.9), 120 * 87.5 * 0.9);
assert.equal(scaledQty(100, 10, null), 1000);
assert.deepEqual(formatQty(1530, "g"), { value: "1,5", unit: "kg" });
assert.deepEqual(formatQty(998.4, "g"), { value: "998", unit: "g" });
assert.deepEqual(formatQty(2500, "ml"), { value: "2,5", unit: "l" });
assert.deepEqual(formatQty(12.01, "ks"), { value: "12,1", unit: "ks" });
assert.deepEqual(formatQty(12, "ks"), { value: "12", unit: "ks" });
console.log("kitchen sizing ok");
