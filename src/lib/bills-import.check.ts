// Self-check for the pure bill-import helpers: `npx tsx src/lib/bills-import.check.ts`
import assert from "node:assert/strict";
import { BILL_IMPORT_FIELDS, parseAmount, parseBillCategories, parseCurrency, parseDriveFileId } from "@/lib/bills-import";
import { guessMappingFor } from "@/lib/planning-import";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
assert.equal(parseDriveFileId(`https://drive.google.com/file/d/${ID}/view?usp=drive_link`), ID);
assert.equal(parseDriveFileId(`https://drive.google.com/open?id=${ID}`), ID);
assert.equal(parseDriveFileId(`https://drive.google.com/uc?export=download&id=${ID}`), ID);
assert.equal(parseDriveFileId(ID), ID);
assert.equal(parseDriveFileId("uctenka.pdf"), null);

assert.deepEqual(["1 234,50 Kč", "1234.5", "1.234,50", "1,234.50", "-12,00", "abc", ""].map(parseAmount), [1234.5, 1234.5, 1234.5, 1234.5, -12, null, null]);
assert.deepEqual(["Kč", "CZK", "12 €", "EUR", "zł", "PLN", "USD"].map(parseCurrency), ["CZK", "CZK", "EUR", "EUR", "PLN", "PLN", null]);

assert.deepEqual(parseBillCategories("Jídlo"), [{ name: "Jídlo", amount: null }]);
assert.deepEqual(parseBillCategories("Jídlo 200; Doprava 100,50 Kč"), [{ name: "Jídlo", amount: 200 }, { name: "Doprava", amount: 100.5 }]);
assert.deepEqual(parseBillCategories("Materiál (1 250)"), [{ name: "Materiál", amount: 1250 }]);

assert.deepEqual(guessMappingFor(["Datum", "Obchodník", "Částka", "Měna", "Kategorie", "Kdo platil", "Odkaz na soubor", "Proplaceno", "Poznámka"], BILL_IMPORT_FIELDS), [
  "date", "merchant", "amount", "currency", "categories", "payer", "file", "paid", "notes",
]);
console.log("bills-import.check: ok");
