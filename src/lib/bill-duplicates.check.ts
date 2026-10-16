// Self-check: npx tsx src/lib/bill-duplicates.check.ts
import assert from "node:assert/strict";
import { duplicateReason, findDuplicateGroups, pairKey, type DupBill } from "@/lib/bill-duplicates";

const b = (id: string, o: Partial<DupBill>): DupBill => ({ id, contentHash: null, totalAmount: 100, currency: "CZK", amountCzk: 100, billDate: "2026-07-02", merchantName: "Albert", ...o });
assert.equal(duplicateReason(b("a", { contentHash: "h" }), b("b", { contentHash: "h", totalAmount: 5, amountCzk: 5 })), "content", "same file wins");
assert.equal(duplicateReason(b("a", {}), b("b", { merchantName: "Lidl" })), "amount_date", "same amount + date, shop not needed");
assert.equal(duplicateReason(b("a", {}), b("b", { billDate: "2026-07-04" })), "amount_near", "±3 days with the same shop");
assert.equal(duplicateReason(b("a", {}), b("b", { billDate: "2026-07-04", merchantName: "Lidl" })), null, "±3 days needs the shop");
assert.equal(duplicateReason(b("a", {}), b("b", { billDate: "2026-07-09" })), null, "a week apart: no");
assert.equal(duplicateReason(b("a", { billDate: null }), b("b", {})), "amount_shop");
assert.equal(duplicateReason(b("a", {}), b("b", { totalAmount: 101, amountCzk: 101.5 })), null, "different amount");
// Foreign currency: the same PLN receipt twice; and once in PLN, once typed in Kč.
const pln = (id: string, o: Partial<DupBill> = {}) => b(id, { totalAmount: 95, currency: "PLN", amountCzk: 540, merchantName: "Biedronka", ...o });
assert.equal(duplicateReason(pln("a"), pln("b", { amountCzk: 541.2 })), "amount_date", "same PLN amount (Kč from another day's rate)");
assert.equal(duplicateReason(pln("a"), b("b", { totalAmount: 543, amountCzk: 543, merchantName: "Biedronka" })), "amount_date", "PLN vs the same receipt in Kč (within 1 %)");
assert.equal(duplicateReason(pln("a"), b("b", { totalAmount: 560, amountCzk: 560 })), null, "Kč more than 1 % off");
assert.equal(duplicateReason(b("a", { totalAmount: 1740, amountCzk: 1740 }), b("b", { totalAmount: 1755, amountCzk: 1755 })), null, "two Kč bills: exact only (1740 vs 1755 is not one receipt)");

// Groups: a-b-c chained, d separate; a dismissed pair breaks it; focus limits.
const all = [b("a", {}), b("b", { merchantName: "Lidl" }), b("c", { billDate: "2026-07-03" }), b("d", { totalAmount: 7, amountCzk: 7 }), b("e", { totalAmount: 7, amountCzk: 7, merchantName: "Penny" })];
const g = findDuplicateGroups(all, new Set());
assert.deepEqual(g.map((x) => x.billIds.sort()), [["a", "b", "c"], ["d", "e"]]);
assert.equal(g[0].reason, "amount_date");
assert.deepEqual(findDuplicateGroups(all, new Set([pairKey("d", "e")])).map((x) => x.billIds.sort()), [["a", "b", "c"]], "Není duplicita");
assert.deepEqual(findDuplicateGroups(all, new Set(), new Set(["e"])).map((x) => x.billIds.sort()), [["d", "e"]], "focus on selected bills");
console.log("ok");
