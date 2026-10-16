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
