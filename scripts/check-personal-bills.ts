// Self-check for personal bills (src/lib/personal-bills.ts). npx tsx scripts/check-personal-bills.ts
import assert from "node:assert/strict";
import { evenSplit, netSettlement, splitStatus } from "../src/lib/personal-bills";

assert.deepEqual(evenSplit(500, 5), [100, 100, 100, 100, 100]);
assert.deepEqual(evenSplit(500, 3), [166.67, 166.67, 166.66], "the haléře add up");
assert.deepEqual(evenSplit(0.05, 2), [0.03, 0.02]);
assert.deepEqual(evenSplit(100, 0), []);
assert.deepEqual(splitStatus(500, [200, 200]), { assigned: 400, remaining: 100, complete: false });
assert.ok(splitStatus(0.3, [0.1, 0.2]).complete, "no float drift");

// Pavel's case: the event owes Jana 200 (official), Jana owes the treasurer 100 for ice cream -> pay her 100.
const T = "treasurer";
const r = netSettlement(T, new Map([["jana", 200], ["petr", 50]]), [
  { debtorId: "jana", creditorId: T, amountCzk: 100 },
  { debtorId: "petr", creditorId: T, amountCzk: 80 },
  { debtorId: T, creditorId: T, amountCzk: 100 },
  { debtorId: "eva", creditorId: T, amountCzk: 40 },
  // Person to person: Jana owes Karel 80, Karel owes Jana 30 -> Jana owes Karel 50.
  { debtorId: "jana", creditorId: "karel", amountCzk: 80 },
  { debtorId: "karel", creditorId: "jana", amountCzk: 30 },
  { debtorId: "ola", creditorId: "karel", amountCzk: 20 },
]);
const row = (id: string) => r.rows.find((x) => x.authorId === id);
assert.deepEqual(row("jana"), { authorId: "jana", official: 200, toTreasurer: 100, net: 100 });
assert.equal(row("petr")!.net, -30, "owes the treasurer more than the event owes him");
assert.equal(row("eva")!.net, -40, "only a personal debt");
assert.equal(row(T), undefined, "the treasurer's own share is nothing");
assert.deepEqual(r.debts.sort((a, b) => a.debtorId.localeCompare(b.debtorId)), [
  { debtorId: "jana", creditorId: "karel", amountCzk: 50 },
  { debtorId: "ola", creditorId: "karel", amountCzk: 20 },
]);
// No treasurer set: everything stays person to person.
assert.equal(netSettlement(null, new Map(), [{ debtorId: "a", creditorId: "b", amountCzk: 10 }]).debts.length, 1);
console.log("personal bills ok");
