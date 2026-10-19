// Batch of edits from 2026-10-19: page split editor on import, merge in the bill list, Proplaceno text.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });
const rows: Row[] = [
  r("billModal.paidStatusPaid", "Proplaceno", "Paid"),
  r("pageSplit.button", "Stránky ({count})", "Pages ({count})"),
  r("pageSplit.hint", "Klikněte na ✂ mezi stránkami tam, kde začíná další účtenka. Stránku můžete přetáhnout jinam (nebo šipkami ← →) či vynechat. Prázdné stránky jsou vynechané předem. Kliknutím na náhled ho zvětšíte.", "Click ✂ between pages where the next bill starts. Drag a page elsewhere (or use ← →) or leave it out. Blank pages start left out. Click a thumbnail to enlarge it."),
  r("pageSplit.together", "Nedělit", "Keep together"),
  r("pageSplit.every", "Po {n} str.", "Every {n} p."),
  r("pageSplit.moveLeft", "Posunout doleva", "Move left"),
  r("pageSplit.moveRight", "Posunout doprava", "Move right"),
  r("pageSplit.blank", "prázdná", "blank"),
  r("pageSplit.remove", "Vynechat", "Leave out"),
  r("pageSplit.restore", "Vrátit", "Put back"),
  r("pageSplit.cut", "Rozdělit tady", "Split here"),
  r("pageSplit.apply", "Rozdělit (vznikne účtenek: {count})", "Split (bills created: {count})"),
  r("pageSplit.applyOne", "Uložit stránky", "Save pages"),
  r("pageSplit.renderFailed", "Náhledy stránek se nepodařilo načíst.", "Couldn't load the page previews."),
  r("importPage.result.multiPage", "Souborů s více stranami: {count} – zůstaly vcelku. Jestli je v nich víc účtenek, rozdělte je tlačítkem „Stránky“ v tabulce.", "Files with several pages: {count} – kept together. If one holds several bills, split it with the “Pages” button in the table."),
  r("billsPage.bulkMerge", "Sloučit do jedné", "Merge into one"),
  r("billsPage.confirmMerge", "Sloučit vybrané účtenky ({count}) do jedné, stránky v tomto pořadí?\n{names}\n\nPůvodní účtenky se smažou. Pokud už je přečetla AI, sloučená se přečte znovu.", "Merge the selected bills ({count}) into one, pages in this order?\n{names}\n\nThe original bills are deleted. If the AI already read them, the merged one is read again."),
  r("billsPage.mergeDone", "Sloučeno do: {name}", "Merged into: {name}"),
  r("billPages.error.failed", "Nepovedlo se.", "That didn't work."),
  r("billPages.error.event_closed_locked", "Akce je uzavřená.", "The event is closed."),
  r("billPages.error.bill_approved_locked", "Schválenou účtenku nejde měnit – nejdřív ji vraťte ke kontrole.", "An approved bill can't be changed – reopen it first."),
  r("billPages.error.bill_processing_locked", "Účtenku právě čte AI, počkejte.", "The AI is reading the bill, please wait."),
  r("billPages.error.no_file", "Účtenka nemá soubor.", "The bill has no file."),
  r("billPages.error.bank_paired", "Účtenka je spárovaná s platbou v bance – nejdřív ji odpárujte.", "The bill is paired with a bank payment – unpair it first."),
  r("billPages.error.paid", "Účtenka je označená jako proplacená – nejdřív to zrušte.", "The bill is marked as paid – undo that first."),
  r("billPages.error.not_pdf", "Jde jen u PDF souborů.", "Only works with PDF files."),
  r("billPages.error.bad_groups", "Neplatné rozdělení stránek.", "Invalid page split."),
  r("billPages.error.duplicate", "Stejný soubor už v akci je.", "The same file is already in the event."),
  r("billPages.error.need_two_bills", "Vyberte aspoň dvě účtenky.", "Select at least two bills."),
  r("billPages.error.not_found", "Účtenka nenalezena (obnovte stránku).", "Bill not found (refresh the page)."),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} edits 2026-10-19 keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
