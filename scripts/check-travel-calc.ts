// Self-check for src/lib/travel-order-calc.ts: npx tsx scripts/check-travel-calc.ts
// Expected values worked out by hand (arithmetic in the comments), not by the function under test.
import assert from "node:assert/strict";
import { calcTravelOrder, consumptionOf, normalizePhone, pickRateSet, type CalcInput, type RateValues } from "../src/lib/travel-order-calc";

const table = { petrol: { manual: 6.9, auto: 7.6 }, diesel: { manual: 5.8, auto: 6.4 }, electric: { manual: 0, auto: 0 } };
const r01: RateValues = { basePerKm: "5.90", trailerSurchargePct: 15, dieselPrice: "34.10", petrol95Price: "34.70", petrol98Price: "39.00", electricityPrice: "7.20", consumptionDefaults: table };
const r06: RateValues = { ...r01, dieselPrice: "44.50" };
const r10: RateValues = { ...r01, dieselPrice: "44.50", petrol95Price: "41.80" };
const km = (...k: number[]) => k.map((x) => ({ km: x }));
const ok = (i: CalcInput) => {
  const res = calcTravelOrder(i);
  assert.ok(res.ok, JSON.stringify(res));
  return res;
};
const pavelLegs = km(152, 12, 12, 24, 24, 6, 6, 152);

// Pavel, 2026-01: 7.6 × 34.70 / 100 = 2.6372 + 5.90 = 8.5372 Kč/km.
// 152 → 1297.6544 → 1297.7; 12 → 102.4464 → 102.4; 24 → 204.8928 → 204.9; 6 → 51.2232 → 51.2.
// 2 × (1297.7 + 102.4 + 204.9 + 51.2) = 3312.4 → ceiling 0.5 = 3312.5.
let p = ok({ rates: r01, fuel: "petrol95", gearbox: "automatic", tp: [null, null, null, null], legs: pavelLegs });
assert.equal(p.consumption, "7.60");
assert.equal(p.consumptionSource, "table");
assert.equal(p.legsSum, "3312.40");
assert.equal(p.total, "3312.50");
assert.equal(p.totalKm, "388.0");
assert.deepEqual(p.legs.map((l) => l.kmAmount), ["1297.7", "102.4", "102.4", "204.9", "204.9", "51.2", "51.2", "1297.7"]);
// Summary lines: PHM = 388 × 7.6 × 34.70 / 100 = 1023.2336; km × sazba = 388 × 5.90 = 2289.2.
assert.equal(p.fuelCost, "1023.2336");
assert.equal(p.kmRateAmount, "2289.2");

// Pavel, 2026-10: 7.6 × 41.80 / 100 = 3.1768 + 5.90 = 9.0768.
// 152 → 1379.6736 → 1379.7; 12 → 108.9216 → 108.9; 24 → 217.8432 → 217.8; 6 → 54.4608 → 54.5.
// 2 × 1760.9 = 3521.8 → 3522.0.
p = ok({ rates: r10, fuel: "petrol95", gearbox: "automatic", tp: [], legs: pavelLegs });
assert.equal(p.legsSum, "3521.80");
assert.equal(p.total, "3522.00");

// Kuba, 2026-01, TP 4.0, diesel 34.10: 1.364 + 5.90 = 7.264 × 165 = 1198.56 → 1198.6; × 2 = 2397.2 → 2397.5.
p = ok({ rates: r01, fuel: "diesel", gearbox: "manual", tp: [4.0], legs: km(165, 165) });
assert.equal(p.consumptionSource, "tp");
assert.equal(p.legsSum, "2397.20");
assert.equal(p.total, "2397.50");
// Kuba, 2026-06, diesel 44.50: 1.78 + 5.90 = 7.68 × 165 = 1267.2; × 2 = 2534.4 → 2534.5.
p = ok({ rates: r06, fuel: "diesel", gearbox: "manual", tp: ["4,0", null, 0, ""], legs: km(165, 165) });
assert.equal(p.legsSum, "2534.40");
assert.equal(p.total, "2534.50");

// TP average of two values, ignoring zero and null: (5.1 + 5.4) / 2 = 5.25. Diesel 34.10:
// 5.25 × 34.10 / 100 = 1.79025 + 5.90 = 7.69025 × 100 = 769.025 → 769.0; ceiling stays 769.0.
p = ok({ rates: r01, fuel: "diesel", gearbox: "automatic", tp: [5.1, 0, 5.4, null], legs: km(100) });
assert.equal(p.consumption, "5.25");
assert.equal(p.total, "769.00");
// TP average rounds half-up to 2 places: (5.555 + 5.555) / 2 = 5.555 → 5.56.
assert.equal(consumptionOf(r01, "diesel", "manual", [5.555, 5.555]).value.toFixed(2), "5.56");

// Table fallback for every fuel and gearbox (Natural 95 and 98 share the petrol row).
const tableCases: [CalcInput["fuel"], CalcInput["gearbox"], string][] = [
  ["petrol95", "manual", "6.9"], ["petrol95", "automatic", "7.6"], ["petrol98", "manual", "6.9"], ["petrol98", "automatic", "7.6"],
  ["diesel", "manual", "5.8"], ["diesel", "automatic", "6.4"], ["electric", "manual", "0"], ["electric", "automatic", "0"],
];
for (const [fuel, gearbox, want] of tableCases) {
  const c = consumptionOf(r01, fuel, gearbox, [0, null]);
  assert.equal(c.source, "table");
  assert.equal(c.value.toString(), want, `${fuel} ${gearbox}`);
}

// Electric with the default 0: only the base rate. 10 km × 5.90 = 59.0.
p = ok({ rates: r01, fuel: "electric", gearbox: "automatic", tp: [], legs: km(10) });
assert.equal(p.fuelPerKm, "0");
assert.equal(p.total, "59.00");

// Receipt price override: Natural 95 automatic 7.6 × 40 / 100 = 3.04 + 5.90 = 8.94 × 50 = 447.0.
p = ok({ rates: r01, fuel: "petrol95", gearbox: "automatic", tp: [], receiptPrice: "40", legs: km(50) });
assert.equal(p.price, "40.00");
assert.ok(p.priceFromReceipt);
assert.equal(p.total, "447.00");

// Trailer leg: base 5.90 × 1.15 = 6.785; TP 4.0 diesel 34.10 → 1.364 + 6.785 = 8.149 × 100 = 814.9.
// km × sazba = 100 × 5.90 + 100 × 5.90 × 0.15 = 590 + 88.5 = 678.5.
p = ok({ rates: r01, fuel: "diesel", gearbox: "manual", tp: [4], legs: [{ km: 100, trailer: true }] });
assert.equal(p.legs[0].kmAmount, "814.9");
assert.equal(p.trailerKm, "100.0");
assert.equal(p.kmRateAmount, "678.5");

// Per-leg half-up at exactly x.x5: electric 1.5 km × 5.90 = 8.85 → 8.9 (half-even would give 8.8).
// Total ceiling: 8.9 → 9.0.
p = ok({ rates: r01, fuel: "electric", gearbox: "manual", tp: [], legs: km(1.5) });
assert.equal(p.legs[0].kmAmount, "8.9");
assert.equal(p.total, "9.00");
// Ceiling at the exact 0.5 boundary stays: 5 km × 5.90 = 29.5 → 29.5.
p = ok({ rates: r01, fuel: "electric", gearbox: "manual", tp: [], legs: km(5) });
assert.equal(p.total, "29.50");

// Manual amounts are added before the ceiling: 10 km = 59.0 + stravné 120.30 + vedlejší 15 = 194.30 → 194.5
// (adding after the ceiling would give 59.0 + 135.30 = 194.30).
p = ok({ rates: r01, fuel: "electric", gearbox: "manual", tp: [], legs: [{ km: 10, stravne: "120.30", nocleh: "", vedlejsi: 15 }] });
assert.equal(p.legs[0].total, "194.30");
assert.equal(p.total, "194.50");

// Empty rows are ignored.
p = ok({ rates: r01, fuel: "electric", gearbox: "manual", tp: [], legs: [{ km: 10 }, { km: "" }, { km: null, stravne: null }] });
assert.equal(p.legs.length, 1);

// Invalid inputs.
const bad = (i: Partial<CalcInput>, want: string) => {
  const res = calcTravelOrder({ rates: r01, fuel: "diesel", gearbox: "manual", tp: [], legs: km(10), ...i });
  assert.ok(!res.ok && res.errors.includes(want), `${want}: ${JSON.stringify(res)}`);
};
bad({ legs: [{ km: 0 }] }, "leg_km:0");
bad({ legs: [{ km: 10 }, { km: -5 }] }, "leg_km:1");
bad({ legs: [{ km: null, stravne: 100 }] }, "leg_km:0");
bad({ legs: [{ km: 10, nocleh: -1 }] }, "leg_amount:0");
bad({ legs: [{ km: "abc" }] }, "leg_km:0");
bad({ legs: [] }, "no_legs");
bad({ receiptPrice: 0 }, "bad_receipt_price");
bad({ receiptPrice: "-3" }, "bad_receipt_price");
bad({ fuel: "lpg" as never }, "bad_fuel");

// Rate-set selection by the trip's start day.
const sets = [{ validFrom: new Date("2026-06-01"), id: "06" }, { validFrom: new Date("2026-01-01"), id: "01" }, { validFrom: new Date("2026-10-01"), id: "10" }];
assert.equal(pickRateSet(sets, "2026-05-31")?.id, "01");
assert.equal(pickRateSet(sets, "2026-06-01")?.id, "06");
assert.equal(pickRateSet(sets, new Date("2026-10-01T15:00:00Z"))?.id, "10");
assert.equal(pickRateSet(sets, "2025-12-31"), null);

// Phone normalization.
assert.equal(normalizePhone(777123456), "+420 777 123 456");
assert.equal(normalizePhone("+420777123456"), "+420 777 123 456");
assert.equal(normalizePhone("00420 777 12 34 56"), "+420 777 123 456");
assert.equal(normalizePhone(""), null);
assert.equal(normalizePhone("+49 151 1234567"), "+49 151 1234567");

console.log("check-travel-calc: all passed");
