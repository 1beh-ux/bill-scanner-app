// Bill import from a table (old Apps Script export or any sheet).
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    { key: "billImport.button", cs: "Import z tabulky", en: "Import from a table" },
    { key: "billImport.title", cs: "Import účtenek z tabulky", en: "Import bills from a table" },
    { key: "billImport.hint", cs: "Každý řádek = jedna účtenka. Soubor se stáhne z odkazu na Google Disku a údaje z řádku (obchodník, datum, částka, kategorie, plátce…) se k účtence rovnou vyplní. Vícestránkové PDF zůstane jednou účtenkou. Již importované soubory se přeskočí.", en: "Each row = one bill. The file is downloaded from its Google Drive link and the row's data (merchant, date, amount, categories, payer…) is filled in. A multi-page PDF stays one bill. Files imported before are skipped." },
    { key: "billImport.shareHint", cs: "Tabulka i soubory účtenek musí být přístupné účtu, přes který akce pracuje s Diskem (Nastavení akce → Připojení).", en: "The sheet and the bill files must be accessible to the account the event uses for Drive (Event settings → Connections)." },
    { key: "billImport.createMissing", cs: "Chybějící plátce a kategorie vytvořit", en: "Create missing payers and categories" },
    { key: "billImport.approveComplete", cs: "Úplné účtenky rovnou schválit (jinak jdou K revizi)", en: "Approve complete bills right away (otherwise they go to review)" },
    { key: "billImport.progress", cs: "{done} / {total} řádků", en: "{done} / {total} rows" },
    { key: "billImport.openBills", cs: "Otevřít účtenky", en: "Open bills" },
    { key: "billImport.errorFailed", cs: "Kontrola se nepodařila.", en: "The check failed." },
    { key: "billImport.field.file", cs: "Odkaz na soubor (Disk)", en: "File link (Drive)" },
    { key: "billImport.field.merchant", cs: "Obchodník", en: "Merchant" },
    { key: "billImport.field.date", cs: "Datum", en: "Date" },
    { key: "billImport.field.amount", cs: "Částka", en: "Amount" },
    { key: "billImport.field.currency", cs: "Měna", en: "Currency" },
    { key: "billImport.field.payer", cs: "Plátce", en: "Payer" },
    { key: "billImport.field.categories", cs: "Kategorie (např. Jídlo 200; Doprava 100)", en: "Categories (e.g. Food 200; Transport 100)" },
    { key: "billImport.field.notes", cs: "Poznámka", en: "Notes" },
    { key: "billImport.field.paid", cs: "Proplaceno (ano/ne)", en: "Reimbursed (yes/no)" },
    { key: "billImport.count.toImport", cs: "K importu", en: "To import" },
    { key: "billImport.count.created", cs: "Vytvořené účtenky", en: "Bills created" },
    { key: "billImport.count.approved", cs: "Z toho schválené", en: "Of which approved" },
    { key: "billImport.count.skipped", cs: "Přeskočené (už importované / duplicitní)", en: "Skipped (already imported / duplicate)" },
    { key: "billImport.count.categoriesCreated", cs: "Nové kategorie", en: "New categories" },
    { key: "billImport.count.payersCreated", cs: "Noví plátci", en: "New payers" },
    { key: "billImport.issue.missing_file", cs: "chybí odkaz na soubor", en: "file link missing" },
    { key: "billImport.issue.invalid_file_link", cs: "odkaz na soubor nelze přečíst", en: "can't read the file link" },
    { key: "billImport.issue.duplicate_in_table", cs: "stejný soubor je v tabulce víckrát — použit první řádek", en: "same file appears more than once — first row used" },
    { key: "billImport.issue.invalid_amount", cs: "neplatná částka", en: "invalid amount" },
    { key: "billImport.issue.invalid_date", cs: "neplatné datum", en: "invalid date" },
    { key: "billImport.issue.unknown_currency", cs: "neznámá měna — použito CZK", en: "unknown currency — CZK used" },
    { key: "billImport.issue.invalid_bool", cs: "čekáno ano/ne", en: "expected yes/no" },
    { key: "billImport.issue.already_imported", cs: "soubor už byl importován — přeskočeno", en: "file already imported — skipped" },
    { key: "billImport.issue.unknown_category", cs: "neznámá kategorie — vynechána", en: "unknown category — left out" },
    { key: "billImport.issue.unknown_payer", cs: "neznámý plátce — účtenka bez plátce", en: "unknown payer — bill without payer" },
    { key: "billImport.issue.category_amounts_incomplete", cs: "u více kategorií chybí částka — kategorie bez částky vynechány", en: "several categories lack an amount — those are left out" },
    { key: "billImport.issue.google_doc_file", cs: "soubor je Google dokument, ne PDF/obrázek", en: "the file is a Google Doc, not a PDF/image" },
    { key: "billImport.issue.invalid_file", cs: "soubor nejde zpracovat (poškozené PDF?)", en: "file can't be processed (broken PDF?)" },
    { key: "billImport.issue.duplicate_file", cs: "stejný soubor už v akci je — přeskočeno", en: "the same file is already in the event — skipped" },
    { key: "billImport.issue.not_approved", cs: "importováno, ale neschváleno (neúplné)", en: "imported but not approved (incomplete)" },
    { key: "billImport.issue.file_no_access", cs: "k souboru nemá účet akce přístup", en: "the event's account can't access the file" },
    { key: "billImport.issue.file_failed", cs: "stažení souboru selhalo", en: "downloading the file failed" },
    { key: "billImport.issue.chunk_failed", cs: "dávka od tohoto řádku selhala — zkuste import znovu (hotové se přeskočí)", en: "the batch from this row failed — run the import again (done rows are skipped)" },
    { key: "billImport.issue.event_closed", cs: "akce je uzavřená", en: "the event is closed" },
    // Multi-column fields + preview with row selection
    { key: "billImport.joinTitle", cs: "Spojování sloupců (pole označená ⊕ mohou mít víc sloupců)", en: "Joining columns (fields marked ⊕ can take several columns)" },
    { key: "billImport.joinSeparator", cs: "Oddělit:", en: "Separate with:" },
    { key: "billImport.sep.newline", cs: "novým řádkem", en: "new line" },
    { key: "billImport.sep.dot", cs: "„ · “", en: "“ · ”" },
    { key: "billImport.sep.comma", cs: "čárkou", en: "comma" },
    { key: "billImport.joinWithHeaders", cs: "Přidat názvy sloupců („Sloupec: hodnota“)", en: "Prefix column names (“Column: value”)" },
    { key: "billImport.joinHint", cs: "Pro spojení přiřaďte stejné pole (např. Poznámka) více sloupcům. Kategorie se spojují vždy středníkem.", en: "To join, map the same field (e.g. Notes) to several columns. Categories always join with a semicolon." },
    { key: "billImport.joinActive", cs: "Některá pole se skládají z více sloupců — výsledek vidíte v náhledu níže.", en: "Some fields combine several columns — see the result in the preview below." },
    { key: "billImport.previewTable", cs: "Náhled dat", en: "Data preview" },
    { key: "billImport.selectedCount", cs: "vybráno {count} z {total}", en: "{count} of {total} selected" },
    { key: "billImport.status", cs: "Stav (po kontrole)", en: "Status (after check)" },
    { key: "billImport.fileLinked", cs: "odkaz", en: "link" },
    { key: "billImport.runSelected", cs: "Importovat vybrané ({count})", en: "Import selected ({count})" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} bill-import keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
