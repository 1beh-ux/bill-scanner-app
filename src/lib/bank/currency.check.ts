// Self-check: npx tsx src/lib/bank/currency.check.ts
import assert from "node:assert/strict";
import { billValueIn, compareAmounts, money, moneyMix } from "@/lib/bank/currency";

const plnBill = { currency: "PLN", totalAmount: 95, amountCzk: 540, remainingCzk: 540 };
const czkBill = { currency: "CZK", totalAmount: 300, amountCzk: 300, remainingCzk: 300 };
assert.equal(billValueIn(plnBill, "PLN"), 95);
assert.equal(billValueIn(plnBill, "CZK"), 540);
assert.equal(billValueIn(czkBill, "PLN"), null, "no rate guessing");
assert.equal(billValueIn(plnBill, "PLN", 0.5), 47.5);
const tx = (o: Partial<Parameters<typeof compareAmounts>[0]>) => ({ currency: "CZK", remaining: 0, originalAmount: null, originalCurrency: null, untouched: true, ...o });
assert.deepEqual(compareAmounts(tx({ currency: "PLN", remaining: 95 }), plnBill), { kind: "exact", inTx: 95 }, "PLN account vs PLN bill");
assert.equal(compareAmounts(tx({ currency: "PLN", remaining: 540 }), plnBill), null, "a PLN payment isn't compared with the Kč amount");
assert.deepEqual(compareAmounts(tx({ remaining: 553.2, originalAmount: 95, originalCurrency: "PLN" }), plnBill), { kind: "exact", inTx: 553.2 }, "Kč card payment with the original 95 PLN");
assert.equal(compareAmounts(tx({ remaining: 553.2, originalAmount: 95, originalCurrency: "PLN", untouched: false }), plnBill)?.kind, "fx", "partly used: only the ±3 % rule");
assert.deepEqual(compareAmounts(tx({ remaining: 553.2 }), plnBill), { kind: "fx", inTx: 553.2 }, "Kč payment vs PLN bill within 3 %");
assert.equal(compareAmounts(tx({ remaining: 600 }), plnBill), null);
assert.deepEqual(compareAmounts(tx({ remaining: 300 }), czkBill), { kind: "exact", inTx: 300 });
assert.equal(compareAmounts(tx({ remaining: 301 }), czkBill), null, "Kč vs Kč exact only");
assert.equal(money(1234.5, "CZK"), "1 234,50 Kč");
assert.equal(money(95, "PLN"), "95,00 PLN");
assert.equal(moneyMix([{ currency: "CZK", amount: 0 }, { currency: "PLN", amount: -95 }]), "-95,00 PLN");
console.log("ok");
