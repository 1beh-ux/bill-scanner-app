// Self-check for personal bills (src/lib/personal-bills.ts). npx tsx scripts/check-personal-bills.ts
import assert from "node:assert/strict";
import { evenSplit, netSettlement, splitStatus, tallyAmount } from "../src/lib/personal-bills";

assert.deepEqual(evenSplit(500, 5), [100, 100, 100, 100, 100]);
assert.deepEqual(evenSplit(500, 3), [166.67, 166.67, 166.66], "the haléře add up");
assert.deepEqual(evenSplit(0.05, 2), [0.03, 0.02]);
assert.deepEqual(evenSplit(100, 0), []);
assert.deepEqual(splitStatus(500, [200, 200]), { assigned: 400, remaining: 100, complete: false });
assert.ok(splitStatus(0.3, [0.1, 0.2]).complete, "no float drift");

const open = { debtorOpen: true, creditorOpen: true };
const via = (debtorId: string, creditorId: string | null, amountCzk: number) => ({ debtorId, creditorId, amountCzk, viaEvent: true, ...open });
// Pavel's case: the event owes Jana 200 (official), she owes 100 for ice cream through the event -> pay her 100.
// Jakub bought it (300 for Jana, Petr and himself): the event pays him back 200, his own part is nothing.
const r = netSettlement(new Map([["jana", 200], ["jakub", 50]]), [
  via("jana", "jakub", 100),
  via("petr", "jakub", 100),
  via("jakub", "jakub", 100),
  // Paid from the event's money: Eva pays the event, nobody is paid back.
  via("eva", null, 40),
  // Person to person: Jana owes Karel 80, Karel owes Jana 30 -> Jana owes Karel 50.
  { debtorId: "jana", creditorId: "karel", amountCzk: 80, viaEvent: false, ...open },
  { debtorId: "karel", creditorId: "jana", amountCzk: 30, viaEvent: false, ...open },
  { debtorId: "ola", creditorId: "karel", amountCzk: 20, viaEvent: false, ...open },
  // Already settled sides count for nothing.
  { debtorId: "petr", creditorId: "jakub", amountCzk: 999, viaEvent: true, debtorOpen: false, creditorOpen: false },
]);
const row = (id: string) => r.rows.find((x) => x.authorId === id);
assert.deepEqual(row("jana"), { authorId: "jana", official: 200, personalIn: 0, personalOut: 100, net: 100 });
assert.deepEqual(row("jakub"), { authorId: "jakub", official: 50, personalIn: 200, personalOut: 0, net: 250 });
assert.equal(row("petr")!.net, -100, "pays the event");
assert.equal(row("eva")!.net, -40, "paid from the event's money");
assert.deepEqual(r.debts.sort((a, b) => a.debtorId.localeCompare(b.debtorId)), [
  { debtorId: "jana", creditorId: "karel", amountCzk: 50 },
  { debtorId: "ola", creditorId: "karel", amountCzk: 20 },
]);
// Petr paid the event, but Jakub wasn't paid out yet: only Jakub's side stays open.
const half = netSettlement(new Map(), [{ debtorId: "petr", creditorId: "jakub", amountCzk: 100, viaEvent: true, debtorOpen: false, creditorOpen: true }]);
assert.deepEqual(half.rows.map((x) => [x.authorId, x.net]), [["jakub", 100]]);
// Tally: 7 beers at 35 Kč, 3 at 27.5.
assert.equal(tallyAmount(7, 35), 245);
assert.equal(tallyAmount(3, 27.5), 82.5);
console.log("personal bills ok");
