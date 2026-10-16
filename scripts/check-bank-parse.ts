// Self-check for src/lib/bank/parse.ts: npx tsx scripts/check-bank-parse.ts
import assert from "node:assert/strict";
import { decodeText, detectDelimiter, findHeaderRow, guessBankMapping, mappingProblems, parseBankAmount, parseBankDate, rowsToTransactions, toRows } from "../src/lib/bank/parse";

// Czech number formats
const amounts: [string, number | null][] = [
  ["1 234,56", 1234.56], ["1 234,56", 1234.56], ["1 234,56", 1234.56], ["-1234.56", -1234.56], ["1.234,56 Kč", 1234.56],
  ["(1 234,56)", -1234.56], ["+50", 50], ["1,234.56", 1234.56], ["−45,00", -45], ["45,00-", -45], ["1.234.567", 1234567], ["CZK 12,5", 12.5],
  ["abc", null], ["", null], ["12,34,56", null], ["Albert", null],
];
for (const [raw, want] of amounts) assert.equal(parseBankAmount(raw), want, `amount ${JSON.stringify(raw)}`);

// Dates
const dates: [string, string | null][] = [
  ["16.10.2026", "2026-10-16"], ["16. 10. 2026", "2026-10-16"], ["2026-10-16", "2026-10-16"], ["16/10/2026", "2026-10-16"],
  ["2026-10-01+0200", "2026-10-01"], ["1.7.26", "2026-07-01"], ["16.10.2026 14:30", "2026-10-16"], ["31.2.2026", null], ["x", null], ["1234,56", null],
];
for (const [raw, want] of dates) assert.equal(parseBankDate(raw), want, `date ${raw}`);

// A bank export: account info lines on top, header on line 4, CP1250, ; delimiter, debit/credit columns.
const csv = [
  "Výpis z účtu;2400222222/2010",
  "Období;1.7.2026 - 31.7.2026",
  "",
  "Datum;Název protiúčtu;Protiúčet;VS;Zpráva pro příjemce;Výdaj;Příjem;Typ",
  "02.07.2026;Albert Česká republika;;;Nákup potravin;1 234,50;;Platba kartou",
  "03.07.2026;Jana Nováková;123-4567890/0800;0012345;Táborový poplatek;;3 500,00;Příjem",
  "04.07.2026;Kavárna;;;Káva;45,00;;Platba kartou",
  "04.07.2026;Kavárna;;;Káva;45,00;;Platba kartou",
  "05.07.2026;Chyba;;;;neplatné;;",
].join("\r\n");
const cp1250 = new Uint8Array([...csv].map((ch) => {
  const map: Record<string, number> = { "ý": 0xfd, "ú": 0xfa, "č": 0xe8, "Č": 0xc8, "á": 0xe1, "í": 0xed, "ř": 0xf8, "é": 0xe9, "ž": 0x9e, "ě": 0xec, "š": 0x9a, "ů": 0xf9, "Ú": 0xda, "Š": 0x8a, "Ž": 0x8e, "Ř": 0xd8 };
  const c = ch.charCodeAt(0);
  if (c < 128) return c;
  if (map[ch] === undefined) throw new Error(`fixture char ${ch}`);
  return map[ch];
}));
const text = decodeText(cp1250);
assert.ok(text.includes("Název protiúčtu"), "CP1250 decoded");
assert.equal(decodeText(new TextEncoder().encode("﻿Datum;Částka")), "Datum;Částka", "UTF-8 BOM");
assert.equal(detectDelimiter(text), ";");
const rows = toRows(text);
const h = findHeaderRow(rows);
assert.equal(h, 2, "header row (line 4 of the file; the empty line 3 is dropped)"); // rows exclude empty lines
const mapping = guessBankMapping(rows[h]);
assert.deepEqual(mapping, ["date", "counterName", "counterAccount", "vs", "message", "debit", "credit", "type"]);
assert.deepEqual(mappingProblems(mapping), []);
const res = rowsToTransactions(rows.slice(h + 1), mapping, { firstLine: 5, currency: "CZK", idPrefix: "id:" });
const ok = res.filter((r) => r.ok).map((r) => (r.ok ? r.tx : null)!);
assert.equal(ok.length, 4);
assert.equal(ok[0].amount, -1234.5);
assert.equal(ok[1].amount, 3500);
assert.equal(ok[1].counterpartyAccount, "123-4567890");
assert.equal(ok[1].counterpartyBankCode, "0800");
assert.equal(ok[1].vs, "12345", "VS without leading zeros");
assert.ok(ok[2].externalId.startsWith("h:") && ok[2].externalId !== ok[3].externalId, "identical same-day rows get different externalIds");
const again = rowsToTransactions(rows.slice(h + 1), mapping, { firstLine: 5, currency: "CZK", idPrefix: "id:" });
assert.deepEqual(again.map((r) => (r.ok ? r.tx.externalId : r.reason)), res.map((r) => (r.ok ? r.tx.externalId : r.reason)), "re-import gives the same ids");
const bad = res.find((r) => !r.ok);
assert.ok(bad && !bad.ok && bad.reason === "bad_amount" && bad.line === 9, "text in an amount column is an error, never a number");

// Amount + direction column; an ID column -> prefixed id.
const r2 = rowsToTransactions([["1.7.2026", "500", "D", "777"], ["1.7.2026", "500", "C", "778"]], ["date", "amount", "direction", "externalRef"], { firstLine: 2, currency: "CZK", idPrefix: "fio:" });
assert.deepEqual(r2.map((r) => (r.ok ? [r.tx.amount, r.tx.externalId] : null)), [[-500, "fio:777"], [500, "fio:778"]]);
assert.deepEqual(mappingProblems(["date", "", ""]), ["missing_amount"]);
console.log("check-bank-parse: all passed");
