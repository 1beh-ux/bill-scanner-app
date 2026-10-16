// Self-check: `npx tsx src/lib/settlement.check.ts` -- the example from the request:
// budget 100 000, deposit 80 000, official account 17 000, paid by the camp 75 000.
import assert from "node:assert/strict";
import { computeSettlement } from "@/lib/settlement";
import { buildManifestRows } from "@/lib/manifest";

const s = computeSettlement({
  categories: [{ id: "food", name: "Jídlo", budget: 60000 }, { id: "trips", name: "Výlety", budget: 40000 }],
  bills: [
    { amountCzk: "10000", payerAuthor: null, categories: [{ eventCategoryId: "food", amountCzk: null }] }, // Akce = official
    { amountCzk: 7000, payerAuthor: { isOfficialAccount: true }, categories: [{ eventCategoryId: "trips", amountCzk: 7000 }] },
    { amountCzk: 50000, payerAuthor: { isOfficialAccount: false }, categories: [{ eventCategoryId: "food", amountCzk: 30000 }, { eventCategoryId: "trips", amountCzk: 20000 }] },
    { amountCzk: 25000, payerAuthor: {}, categories: [] }, // cash, no category
    { amountCzk: null, payerAuthor: {}, categories: [] }, // no rate: excluded
  ],
  deposits: [{ amountCzk: "80000", receivedAt: "2026-07-01" }],
});
assert.equal(s.total.official, 17000);
assert.equal(s.total.cash, 75000);
assert.equal(s.total.spent, 92000);
assert.equal(s.spentPercent, 92);
assert.equal(s.depositsTotal, 80000);
assert.equal(s.toReturn, 5000);
assert.equal(s.excluded, 1);
assert.deepEqual(s.lines.find((l) => l.id === "food"), { id: "food", name: "Jídlo", budget: 60000, spent: 40000, official: 10000, cash: 30000 });
assert.equal(s.lines.find((l) => l.id === null)?.cash, 25000);
// Manifest "columns" mode: one column per used category (by name), numbers only.
const mb = (amount: string, cats: [string, string | null][], payer: { canonicalName: string; isOfficialAccount?: boolean } | null = null) => ({
  billDate: new Date("2026-07-02"), merchantName: "Obchod", totalAmount: amount, currency: "CZK", amountCzk: amount,
  payerAuthorId: payer ? "p" : null, payerAuthor: payer, paidToAuthor: false, exportFilename: null,
  categories: cats.map(([name, a]) => ({ amountCzk: a, eventCategory: { name } })),
});
const rows = buildManifestRows([mb("100", [["Jídlo", null]]), mb("300", [["Výlety", "200"], ["Jídlo", "100"]], { canonicalName: "Oficiální účet", isOfficialAccount: true })], [], "columns");
assert.deepEqual(rows[0].slice(-2), ["Jídlo", "Výlety"]);
assert.deepEqual(rows[1].slice(-2), [100, ""]);
assert.deepEqual(rows[2].slice(-2), [100, 200]);
assert.equal(rows[2][6], "Bez proplacení");
// Banka columns + a bill without a document.
const bankRows = buildManifestRows([{ ...mb("100", [["Jídlo", null]]), documentMissing: true, bank: { state: "bank", paidOn: "2026-07-03", movementIds: ["2647"] } }], [], "pairs", true);
assert.deepEqual(bankRows[0].slice(9, 12), ["Platba", "Datum platby", "ID pohybu"]);
assert.deepEqual(bankRows[1].slice(7, 12), ["chybí doklad", "", "Banka", "2026-07-03", "2647"]);
assert.equal(buildManifestRows([mb("100", [["Jídlo", null]])], [], "pairs")[0].includes("Platba"), false, "no bank columns without Banka");
console.log("ok");
