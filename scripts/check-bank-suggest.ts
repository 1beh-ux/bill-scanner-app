// Self-check for src/lib/bank/suggest.ts (pure part): npx tsx scripts/check-bank-suggest.ts
import assert from "node:assert/strict";
import { sameName, suggestPairs, type SuggestBill, type SuggestTx } from "../src/lib/bank/suggest";

const tx = (id: string, date: string, czk: number, o: Partial<SuggestTx> = {}): SuggestTx => ({ id, bookingDate: date, remaining: czk, originalAmount: null, originalCurrency: null, bankType: "Platba kartou", text: "", merchantCanonical: null, ...o });
const bill = (id: string, date: string, czk: number, o: Partial<SuggestBill> = {}): SuggestBill => ({ id, billDate: date, remaining: czk, totalAmount: czk, currency: "CZK", merchantName: null, text: "", ...o });

// exact 1:1 -> sure
let s = suggestPairs([tx("t1", "2026-07-03", 1234.5, { text: "ALBERT CR 1234" })], [bill("b1", "2026-07-02", 1234.5, { merchantName: "Albert" })], new Set());
assert.equal(s.length, 1);
assert.equal(s[0].tier, "sure");
assert.deepEqual(s[0].reasons, [{ k: "amount" }, { k: "date", d: 1 }, { k: "merchant", v: "Albert" }]);

// card payment before the bill, or > 5 days after -> nothing
assert.equal(suggestPairs([tx("t1", "2026-07-01", 100)], [bill("b1", "2026-07-02", 100)], new Set()).length, 0);
assert.equal(suggestPairs([tx("t1", "2026-07-09", 100)], [bill("b1", "2026-07-02", 100)], new Set()).length, 0);
// a transfer may come 30 days later
assert.equal(suggestPairs([tx("t1", "2026-08-01", 100, { bankType: "Bezhotovostní platba" })], [bill("b1", "2026-07-02", 100)], new Set()).length, 1);

// two equal amounts -> possible, not sure
s = suggestPairs([tx("t1", "2026-07-03", 45)], [bill("b1", "2026-07-02", 45), bill("b2", "2026-07-03", 45)], new Set());
assert.equal(s.length, 2);
assert.ok(s.every((x) => x.tier === "possible"));

// PLN bill: original amount on the payment, or CZK within 3 %
s = suggestPairs([tx("t1", "2026-07-03", 548.2, { originalAmount: 95, originalCurrency: "PLN" })], [bill("b1", "2026-07-03", 540, { currency: "PLN", totalAmount: 95 })], new Set());
assert.equal(s.length, 1);
assert.equal(s[0].reasons[0].k, "fx");
assert.equal(s[0].tier, "possible", "only an exact CZK amount is sure");
assert.equal(suggestPairs([tx("t1", "2026-07-03", 553)], [bill("b1", "2026-07-03", 540, { currency: "PLN", totalAmount: 95 })], new Set()).length, 1, "within 3 %");
assert.equal(suggestPairs([tx("t1", "2026-07-03", 560)], [bill("b1", "2026-07-03", 540, { currency: "PLN", totalAmount: 95 })], new Set()).length, 0, "outside 3 %");
assert.equal(suggestPairs([tx("t1", "2026-07-03", 553)], [bill("b1", "2026-07-03", 540)], new Set()).length, 0, "a CZK bill needs the exact amount");

// a rejected pair is not suggested again
assert.equal(suggestPairs([tx("t1", "2026-07-03", 99)], [bill("b1", "2026-07-03", 99)], new Set(["t1:b1"])).length, 0);

// payer names from the bank
assert.ok(sameName("NOVAKOVA JANA", "Jana Nováková"));
assert.ok(!sameName("NOVAK JAN", "Jana Nováková"));
console.log("check-bank-suggest: all passed");
