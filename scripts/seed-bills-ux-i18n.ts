// Bill list: column filters, bulk edit, Drive sync status.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    { key: "billFilter.button", cs: "Filtrovat sloupec", en: "Filter column" },
    { key: "billFilter.search", cs: "Hledat…", en: "Search…" },
    { key: "billFilter.selectAll", cs: "(Vybrat vše)", en: "(Select all)" },
    { key: "billFilter.selectAllShown", cs: "(Vybrat vše nalezené)", en: "(Select all found)" },
    { key: "billFilter.noValues", cs: "Nic nenalezeno.", en: "Nothing found." },
    { key: "billFilter.clear", cs: "Zrušit filtr sloupce", en: "Clear column filter" },
    { key: "billDup.title", cs: "Možné duplicity", en: "Possible duplicates" },
    { key: "billDup.findAll", cs: "Možné duplicity", en: "Possible duplicates" },
    { key: "billDup.findSelected", cs: "Najít duplicity vybraných", en: "Find duplicates of selected" },
    { key: "billDup.badge", cs: "možná duplicita", en: "possible duplicate" },
    { key: "billDup.hintAll", cs: "Účtenky, které vypadají jako jedna a ta samá účtenka (např. fotka a PDF z e-mailu). U cizí měny se porovnává původní částka i částka v Kč. Zbylou kopii smažte nebo přesuňte; když jde o různé účtenky, označte „Není duplicita“ a skupina se už neukáže.", en: "Bills that look like one and the same receipt (e.g. a photo and the e-mailed PDF). Foreign currency is compared in the original amount and in CZK. Delete or move the extra copy; if they are different receipts, mark “Not a duplicate” and the group won't show again." },
    { key: "billDup.hintSelected", cs: "Možné duplicity {count} vybraných účtenek (v této akci a stejný soubor i v jiných akcích).", en: "Possible duplicates of {count} selected bills (in this event, and the same file in other events)." },
    { key: "billDup.none", cs: "Žádné možné duplicity.", en: "No possible duplicates." },
    { key: "billDup.reason.content", cs: "Stejný soubor", en: "Same file" },
    { key: "billDup.reason.amount_date", cs: "Stejná částka a datum", en: "Same amount and date" },
    { key: "billDup.reason.amount_near", cs: "Stejná částka a obchod, datum do 3 dnů", en: "Same amount and shop, date within 3 days" },
    { key: "billDup.reason.amount_shop", cs: "Stejná částka a obchod, chybí datum", en: "Same amount and shop, date missing" },
    { key: "billDup.notDuplicate", cs: "Není duplicita", en: "Not a duplicate" },
    { key: "billDup.otherEvent", cs: "v akci {event}", en: "in event {event}" },
    { key: "billDup.moveTo", cs: "Přesunout do…", en: "Move to…" },
    { key: "billDup.moveConfirm", cs: "Přesunout účtenku {name} do akce {event}?", en: "Move the bill {name} to {event}?" },
    { key: "billDup.moved", cs: "Přesunuto do akce {event}.", en: "Moved to {event}." },
    { key: "billDup.moveFailed", cs: "Přesun se nepovedl (schválená, zpracovává se, spárovaná s bankou, nebo bez přístupu).", en: "The move failed (approved, processing, paired with the bank, or no access)." },
    { key: "billDup.bankPairedWarn", cs: "Účtenka je spárovaná s platbou v bance — párování se zruší.", en: "The bill is paired with a bank payment — the pairing will be removed." },
    { key: "billDup.approvedHint", cs: "Schválenou účtenku nejdřív znovu otevřete.", en: "Reopen an approved bill first." },
    { key: "billsPage.sortHint", cs: "Seřadit (klik: A→Z / od nejmenšího, znovu: obráceně, potřetí: zrušit)", en: "Sort (click: A→Z / smallest first, again: reverse, third time: off)" },
    { key: "billsPage.bulkReopen", cs: "Znovu otevřít", en: "Reopen" },
    { key: "billsPage.confirmBulkReopen", cs: "Znovu otevřít {count} vybraných účtenek? Schválené se vrátí do stavu Nové a půjdou upravit; ostatní se přeskočí.", en: "Reopen {count} selected bills? Approved ones go back to New and can be edited; others are skipped." },
    { key: "billsPage.bulkErrNotApproved", cs: "{filename}: není schválená", en: "{filename}: not approved" },
    { key: "billModal.delete", cs: "Smazat účtenku", en: "Delete bill" },
    { key: "billModal.deleteConfirm", cs: "Smazat účtenku {name}? Smaže se i soubor; spárování s bankovní platbou se zruší. Nejde to vrátit.", en: "Delete the bill {name}? Its file is deleted too and any bank pairing is removed. This can't be undone." },
    { key: "billModal.deleteFailed", cs: "Účtenku se nepodařilo smazat.", en: "Couldn't delete the bill." },
    { key: "billModal.error.bill_processing_locked", cs: "AI účtenku právě zpracovává — počkejte.", en: "The AI is processing the bill — wait a moment." },
    { key: "imageViewer.fit", cs: "Celé", en: "Fit" },
    { key: "imageViewer.width", cs: "Na šířku", en: "Fit width" },
    { key: "imageViewer.zoomIn", cs: "Přiblížit", en: "Zoom in" },
    { key: "imageViewer.zoomOut", cs: "Oddálit", en: "Zoom out" },
    { key: "billFilter.apply", cs: "Použít", en: "Apply" },
    { key: "billFilter.cancel", cs: "Zrušit", en: "Cancel" },
    { key: "billFilter.pickOne", cs: "Vyberte aspoň jednu hodnotu", en: "Pick at least one value" },
    { key: "billFilter.active", cs: "Filtrováno ve {count} sloupcích, zobrazeno {shown} účtenek.", en: "Filtered in {count} columns, {shown} bills shown." },
    { key: "billFilter.clearAll", cs: "Zrušit všechny filtry", en: "Clear all filters" },
    { key: "billBulkEdit.button", cs: "Změnit hodnotu", en: "Change a value" },
    { key: "billBulkEdit.fieldLabel", cs: "Co změnit", en: "What to change" },
    { key: "billBulkEdit.field.payer", cs: "Plátce", en: "Payer" },
    { key: "billBulkEdit.field.category", cs: "Kategorie", en: "Category" },
    { key: "billBulkEdit.field.billDate", cs: "Datum", en: "Date" },
    { key: "billBulkEdit.field.merchantName", cs: "Obchod", en: "Merchant" },
    { key: "billBulkEdit.field.notes", cs: "Poznámka", en: "Note" },
    { key: "billBulkEdit.pickCategory", cs: "— vyberte kategorii —", en: "— pick a category —" },
    { key: "billBulkEdit.merchantPlaceholder", cs: "Název obchodu (prázdné = smazat)", en: "Merchant name (empty = clear)" },
    { key: "billBulkEdit.notesPlaceholder", cs: "Poznámka (nahradí stávající; prázdné = smazat)", en: "Note (replaces the current one; empty = clear)" },
    { key: "billBulkEdit.apply", cs: "Použít na {count} účtenek", en: "Apply to {count} bills" },
    { key: "billBulkEdit.hint", cs: "Schválené účtenky a účtenky, které právě zpracovává AI, se nezmění. Změna data u cizí měny přepočítá částku v Kč.", en: "Approved bills and bills AI is processing are not changed. A new date re-converts foreign-currency amounts to CZK." },
    { key: "billBulkEdit.categoryHint", cs: "Celá částka účtenky půjde do vybrané kategorie (případné rozdělení do více kategorií se nahradí). Schválené účtenky se nezmění.", en: "The whole bill amount goes to the chosen category (any split is replaced). Approved bills are not changed." },
    { key: "billBulkEdit.confirm", cs: "Nastavit „{field}“ na „{value}“ u {count} účtenek?", en: "Set “{field}” to “{value}” on {count} bills?" },
    { key: "billBulkEdit.errPayerNotInEvent", cs: "{filename}: plátce není přiřazený k této akci", en: "{filename}: the payer isn't attached to this event" },
    { key: "billBulkEdit.errProcessing", cs: "{filename}: účtenku právě zpracovává AI", en: "{filename}: AI is processing this bill" },
    { key: "billDriveSync.button", cs: "Synchronizovat s Diskem", en: "Sync to Drive" },
    { key: "billDriveSync.running", cs: "Synchronizuji…", en: "Syncing…" },
    { key: "billDriveSync.status", cs: "Na Disku {onDrive} z {approved} schválených", en: "{onDrive} of {approved} approved on Drive" },
    { key: "billDriveSync.last", cs: "naposledy nahráno {when}", en: "last upload {when}" },
    { key: "billDriveSync.missing", cs: "chybí {count} schválených", en: "{count} approved missing" },
    { key: "billDriveSync.notApproved", cs: "{count} neschválených se nenahrává", en: "{count} not approved (not uploaded)" },
    { key: "billDriveSync.openFolder", cs: "Otevřít složku", en: "Open folder" },
    { key: "billDriveSync.noFolder", cs: "Účtenky se zatím na Disk nesynchronizují – akce nemá nastavenou exportní složku.", en: "Bills aren't synced to Drive yet – the event has no export folder." },
    { key: "billDriveSync.setFolder", cs: "Nastavit v Připojení", en: "Set it in Connections" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} bills UX keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
