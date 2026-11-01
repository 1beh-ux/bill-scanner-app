// 2026-11-01: Účtenky -- "Ruční zadání" (a bill typed in by hand: an estimate / no document yet) and
// "Nahradit soubor" on any bill. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("manualBill.button", "Ruční zadání", "Manual entry"),
  r("manualBill.title", "Ruční zadání účtenky", "Enter a bill by hand"),
  r("manualBill.hint", "Odhad nebo účtenka, jejíž doklad ještě nemáte. Počítá se do rozpočtu a součtů jako každá jiná; je označená „chybí doklad“, dokud k ní nenahrajete doklad (pak ho přečte AI).", "An estimate or a bill whose document you don't have yet. It counts in the budget and totals like any other; marked “document missing” until you upload the document onto it (the AI then reads it)."),
  r("manualBill.date", "Datum", "Date"),
  r("manualBill.merchant", "Obchod / co", "Shop / what"),
  r("manualBill.amount", "Částka", "Amount"),
  r("manualBill.payer", "Kdo platil", "Paid by"),
  r("manualBill.payerEvent", "Akce (bez proplacení)", "The event (no reimbursement)"),
  r("manualBill.category", "Kategorie", "Category"),
  r("manualBill.notes", "Poznámka", "Note"),
  r("manualBill.notesPlaceholder", "např. odhad – faktura přijde v prosinci", "e.g. estimate – the invoice comes in December"),
  r("manualBill.save", "Vytvořit účtenku", "Create the bill"),
  r("manualBill.failed", "Uložit se nepovedlo – zkontrolujte datum a částku.", "Saving failed – check the date and amount."),
  r("billSource.manual", "zadáno ručně", "entered by hand"),
  r("billFile.replace", "Nahradit soubor", "Replace the file"),
  r("billFile.replaceWithAi", "a nechat ho přečíst AI", "and let the AI read it"),
  r("billFile.replaceConfirm", "Nahradit soubor účtenky novým? Údaje účtenky zůstanou, jak jsou.", "Replace the bill's file? The bill's data stay as they are."),
  r("billFile.replaceConfirmAi", "Nahradit soubor účtenky novým a nechat ho přečíst AI? AI může přepsat obchod, datum a částku.", "Replace the bill's file and let the AI read it? The AI may overwrite shop, date and amount."),
  r("billFile.error.bill_approved_locked", "Schválenou účtenku nejdřív znovu otevřete.", "Reopen the approved bill first."),
  r("billFile.error.bill_processing_locked", "Účtenku právě zpracovává AI.", "The AI is processing the bill."),
  r("billFile.error.event_closed_locked", "Akce je uzavřená.", "The event is closed."),
  r("billFile.error.no_file", "Vyberte soubor (do 15 MB).", "Choose a file (up to 15 MB)."),
  r("billFile.error.bad_type", "Jen PDF, JPG, PNG nebo WEBP.", "Only PDF, JPG, PNG or WEBP."),
  r("billFile.error.duplicate", "Stejný soubor už má jiná účtenka této akce.", "Another bill of this event already has the same file."),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} manual bills keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
