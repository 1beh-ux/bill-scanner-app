// T1 (audit2): Odeslat lists every missing item at once. npx tsx scripts/check-travel-submit.ts
import assert from "node:assert/strict";
import { submitProblems } from "../src/lib/travel-orders";

const empty = { startAt: "", endAt: "", workerName: "", workerAddress: "", workerPhone: "", vehicleLabel: "", fuel: "", gearbox: "", payoutMethod: "bank" };
assert.deepEqual(submitProblems(empty, null, false, false).map((p) => p.code), ["no_dates", "no_worker", "no_address", "no_phone", "no_vehicle", "no_rate_set", "payout_missing"]);
const full = { startAt: "2027-07-01T08:00", endAt: "2027-07-02T20:00", workerName: "Jan", workerAddress: "Brno", workerPhone: "777", vehicleLabel: "Škoda", fuel: "petrol", gearbox: "manual", payoutMethod: "cash" };
assert.deepEqual(submitProblems(full, { ok: true }, true, false), [], "cash payout needs no account");
assert.deepEqual(submitProblems(full, { ok: false, errors: ["leg_km:0", "leg_km:2", "leg_amount:2"] }, true, false), [{ code: "bad_legs", field: "legs", legs: [0, 2] }]);
assert.deepEqual(submitProblems(full, { ok: false, errors: ["no_legs"] }, true, false).map((p) => p.code), ["no_legs"]);
assert.deepEqual(submitProblems({ ...full, payoutMethod: "bank" }, { ok: true }, true, false).map((p) => p.field), ["payout"]);
console.log("check-travel-submit: all passed");
