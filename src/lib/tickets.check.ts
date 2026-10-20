// Self-check for the ticket helpers: `npx tsx src/lib/tickets.check.ts`
import assert from "node:assert/strict";
import { normalizeTicketCode, orderVs, readTicketSettings, remaining, ticketTypes, validateOrder, withTicketTexts } from "@/lib/tickets";
import { readPriceRules } from "@/lib/price-rules";

const start = new Date("2027-02-13");
const settings = readTicketSettings({ maxPerOrder: 6, totalCapacity: 10 }, start);
assert.equal(settings.vsPrefix, "279");
assert.equal(readTicketSettings({ vsPrefix: "12a" }, start).vsPrefix, "279");
assert.equal(readTicketSettings({ docTemplate: "1AbC-def_ghijklmnopqrstuv" }, start).docTemplate, "1AbC-def_ghijklmnopqrstuv");
assert.equal(readTicketSettings({ docTemplate: "x/../y" }, start).docTemplate, null);
assert.equal(settings.showLeft, true);
assert.deepEqual(readTicketSettings({ texts: { payHint: " Platba ", bogus: "x", note: "  " }, showLeft: false }, start), { ...readTicketSettings({}, start), showLeft: false, texts: { payHint: "Platba" } });
{
  const tt = withTicketTexts((k, v) => `${k}|${v?.number ?? ""}`, { doneTitle: "Díky, objednávka {number}" });
  assert.equal(tt("ticketForm.doneTitle", { number: "5" }), "Díky, objednávka 5");
  assert.equal(tt("ticketForm.payHint"), "ticketForm.payHint|");
}
assert.equal(readTicketSettings(null, start).maxPerOrder, 10);
assert.equal(orderVs("279", 12), "2790012");

const types = ticketTypes(
  readPriceRules({ categories: [{ key: "std", label: "Vstupné", priceCzk: 300, forAdults: true, capacity: 8 }, { key: "stu", label: "Student", priceCzk: 150, forAdults: true, capacity: 3 }] })
);
assert.deepEqual(types.map((t) => t.capacity), [8, 3]);
assert.deepEqual(remaining(types, settings, { std: 7, stu: 1 }), { perType: { std: 1, stu: 2 }, total: 2 });
assert.deepEqual(remaining(types, { ...settings, totalCapacity: null }, { std: 2 }), { perType: { std: 6, stu: 3 }, total: null });

const ok = validateOrder({ buyerName: " Jana ", email: "jana@example.com", counts: { std: 2, stu: 1, nope: 4 } }, { types, settings, sold: {} });
assert.ok(ok.ok);
if (ok.ok) {
  assert.equal(ok.data.totalCzk, 750);
  assert.equal(ok.data.buyerName, "Jana");
  assert.deepEqual(ok.data.items.map((i) => i.count), [2, 1]);
}
const bad = (body: object, sold: Record<string, number> = {}) => {
  const r = validateOrder(body, { types, settings, sold });
  return r.ok ? [] : r.errors;
};
assert.deepEqual(bad({ buyerName: "", email: "x", counts: {} }), ["name", "email", "count"]);
assert.deepEqual(bad({ buyerName: "A", email: "a@b.cz", counts: { std: 7 } }), ["max"]);
assert.deepEqual(bad({ buyerName: "A", email: "a@b.cz", counts: { stu: 3 } }, { stu: 1 }), ["sold_out.stu"]);
assert.deepEqual(bad({ buyerName: "A", email: "a@b.cz", counts: { std: 2, stu: 1 } }, { std: 6, stu: 2 }), ["sold_out"]);
assert.deepEqual(bad({ buyerName: "A", email: "a@b.cz", counts: { std: 1, stu: 1 } }, { stu: 3 }), ["sold_out.stu"]);
assert.deepEqual(bad({ buyerName: "A", email: "a@b.cz", counts: { std: 2.5 } }), ["count"]);

assert.equal(normalizeTicketCode(" abcd-efgh 2345 "), "ABCDEFGH2345");
console.log("tickets ok");
