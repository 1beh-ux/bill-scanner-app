// Self-check for the bank import window (audit 2026-11-05 B1): npx tsx scripts/check-bank-window.ts
// An import (paste / file / Sheet) into a future event keeps the event's real window; only the Fio API
// request is capped at today. And identical rows within one paste stay separate.
import assert from "node:assert/strict";
import { fioFetchWindow, windowOf } from "../src/lib/bank/sync";
import { statusRows } from "../src/lib/bank/import";
import { guessBankMapping, rowsToTransactions, toRows } from "../src/lib/bank/parse";

const link = { dateFrom: new Date("2027-08-01"), dateTo: new Date("2027-08-10") };
assert.deepEqual(windowOf(link), { from: "2027-08-01", to: "2027-08-10" });
// Fio: never past today; a window wholly in the future collapses to today (Fio is then simply asked for today).
assert.deepEqual(fioFetchWindow(link, "2026-11-05"), { from: "2026-11-05", to: "2026-11-05" });
assert.deepEqual(fioFetchWindow({ dateFrom: new Date("2026-10-01"), dateTo: new Date("2026-12-31") }, "2026-11-05"), { from: "2026-10-01", to: "2026-11-05" });
assert.deepEqual(fioFetchWindow({ dateFrom: new Date("2026-07-01"), dateTo: new Date("2026-07-31") }, "2026-11-05"), { from: "2026-07-01", to: "2026-07-31" });

// The audit's fake statement, dated inside the future event (and one row outside it).
const csv = [
  "Datum;Protiúčet;Název protiúčtu;VS;Zpráva;Částka",
  "02.08.2027;;Billa;;Nákup;-312,40",
  "02.08.2027;;Billa;;Nákup;-312,40",
  "03.08.2027;;Bankomat;;Výběr z bankomatu;-2000",
  "04.08.2027;123-4567890/0800;Jana Nováková;1001;Táborový poplatek;2000",
  "05.08.2027;;;;Poplatek za vedení účtu;-49",
  "20.08.2027;;Lidl;;Nákup;-99",
].join("\n");
const rows = toRows(csv);
const mapping = guessBankMapping(rows[0]);
const results = rowsToTransactions(rows.slice(1), mapping, { idPrefix: "id:", firstLine: 2, currency: "CZK" });
const ev = statusRows(results, windowOf(link), new Set());
assert.deepEqual(ev.rows.map((r) => r.status), ["new", "new", "new", "new", "new", "outside"], JSON.stringify(ev.rows));
assert.deepEqual(ev.counts, { new: 5, duplicate: 0, outside: 1, error: 0 });
// Both Billa rows kept (different ids), and importing the same paste again = all duplicates.
assert.notEqual(ev.fresh[0].externalId, ev.fresh[1].externalId);
const again = statusRows(results, windowOf(link), new Set(ev.fresh.map((t) => t.externalId)));
assert.deepEqual(again.counts, { new: 0, duplicate: 5, outside: 1, error: 0 });
// The old behaviour (window capped at today) would have put every row outside.
assert.equal(statusRows(results, fioFetchWindow(link, "2026-11-05"), new Set()).counts.outside, 6);
console.log("check-bank-window: all passed");
