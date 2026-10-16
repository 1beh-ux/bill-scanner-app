// Úklid souborů na Disku, the Zpracované soubory folder, the bill source line.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });
const rows: Row[] = [
  r("nav.driveCleanup", "Úklid Disku", "Drive cleanup"),
  r("driveSettings.processedFolderLabel", "Složka Zpracované soubory (sem se po importu z Disku přesunou naimportované soubory)", "Processed files folder (imported files move here after a Drive import)"),
  r("driveSettings.folder.processed", "složka Zpracované soubory", "the processed files folder"),
  r("importPage.moveFailed", "naimportováno, ale nepřesunuto do Zpracovaných: {reason}", "imported, but not moved to Processed: {reason}"),

  r("billSource.label", "Zdroj:", "Source:"),
  r("billSource.drive", "import z Disku", "Drive import"),
  r("billSource.upload", "nahráno", "uploaded"),
  r("billSource.camera", "vyfoceno", "photo"),
  r("billSource.bank", "vytvořeno z platby v bance", "created from a bank payment"),
  r("billSource.driveFile", "soubor na Disku ↗", "file on Drive ↗"),

  r("driveCleanup.title", "Úklid souborů na Disku", "Drive file cleanup"),
  r("driveCleanup.hint", "Zadejte složky na Disku. Aplikace u každého souboru zjistí, jestli ho používá nějaká účtenka (podle obsahu souboru, ne jména), najde duplicity a nabídne přesun použitých souborů do uklizené složky a přebytečných kopií do koše. Nic se nemaže natrvalo — koš na Disku jde 30 dní obnovit.", "Enter Drive folders. For each file the app finds out whether a bill uses it (by content, not name), finds duplicates and offers to move used files to a cleaned folder and extra copies to the bin. Nothing is deleted permanently — the Drive bin can be restored for 30 days."),
  r("driveCleanup.folders", "Složky ke kontrole (odkazy nebo ID, každá na řádek)", "Folders to check (links or IDs, one per line)"),
  r("driveCleanup.foldersPlaceholder", "https://drive.google.com/drive/folders/…", "https://drive.google.com/drive/folders/…"),
  r("driveCleanup.recursive", "i podsložky", "include subfolders"),
  r("driveCleanup.target", "Cílová složka pro uklizené soubory", "Target folder for cleaned files"),
  r("driveCleanup.targetPlaceholder", "odkaz nebo ID složky", "folder link or ID"),
  r("driveCleanup.targetHint", "Předvyplní se složka Zpracované soubory z Nastavení akce → Připojení.", "Pre-filled with the Processed files folder from Event settings → Connections."),
  r("driveCleanup.scan", "Zkontrolovat soubory", "Check files"),
  r("driveCleanup.scanning", "Kontroluji…", "Checking…"),
  r("driveCleanup.scanFailed", "Kontrola se nepovedla.", "The check failed."),
  r("driveCleanup.folderLine", "{name}: {count} souborů", "{name}: {count} files"),
  r("driveCleanup.truncated", "Souborů je víc než 5000 — zkontrolovány jen první.", "More than 5000 files — only the first were checked."),
  r("driveCleanup.skippedNative", "{count} dokumentů / tabulek Google přeskočeno (nemají otisk obsahu).", "{count} Google Docs / Sheets skipped (no content fingerprint)."),
  r("driveCleanup.filter.all", "Vše", "All"),
  r("driveCleanup.filter.used", "Použité", "Used"),
  r("driveCleanup.filter.unused", "Nepoužité", "Unused"),
  r("driveCleanup.filter.duplicates", "Duplicity", "Duplicates"),
  r("driveCleanup.filter.trash", "Navržené ke smazání", "Proposed for the bin"),
  r("driveCleanup.filter.elsewhere", "V jiné akci", "In another event"),
  r("driveCleanup.selected", "Vybráno {count}", "{count} selected"),
  r("driveCleanup.selectShown", "Vybrat zobrazené", "Select shown"),
  r("driveCleanup.selectProposed", "Vybrat navržené", "Select proposed"),
  r("driveCleanup.move", "Přesunout do cílové složky", "Move to the target folder"),
  r("driveCleanup.trash", "Smazat (do koše)", "Delete (to the bin)"),
  r("driveCleanup.noTarget", "Vyplňte cílovou složku.", "Fill in the target folder."),
  r("driveCleanup.moveConfirm", "Přesunout {count} souborů do cílové složky? Z toho {unused} nepoužívá žádná účtenka. Soubory si ponechají odkazy.", "Move {count} files to the target folder? {unused} of them aren't used by any bill. Files keep their links."),
  r("driveCleanup.trashConfirm", "Přesunout {count} souborů do koše na Disku? Z toho {keepers} používá účtenka nebo je ponechávaná kopie! V koši jdou 30 dní obnovit.", "Move {count} files to the Drive bin? {keepers} of them are used by a bill or are the copy to keep! They can be restored from the bin for 30 days."),
  r("driveCleanup.resultLine", "Hotovo {ok}, chyb {failed}", "Done {ok}, failed {failed}"),
  r("driveCleanup.colFile", "Soubor", "File"),
  r("driveCleanup.colFolder", "Složka", "Folder"),
  r("driveCleanup.colUsedBy", "Použito v účtence", "Used by bill"),
  r("driveCleanup.colProposed", "Návrh", "Proposal"),
  r("driveCleanup.unused", "nepoužito", "not used"),
  r("driveCleanup.bill", "účtenka", "bill"),
  r("driveCleanup.billElsewhere", "účtenka v akci, kam nemáte přístup", "a bill in an event you can't access"),
  r("driveCleanup.severalEvents", "stejná účtenka je ve více akcích", "the same bill exists in several events"),
  r("driveCleanup.dupKeep", "duplicita – ponechat", "duplicate – keep"),
  r("driveCleanup.dupCopy", "duplicita – kopie", "duplicate – extra copy"),
  r("driveCleanup.via.drive_id", "importováno z tohoto souboru", "imported from this file"),
  r("driveCleanup.via.content", "stejný obsah", "same content"),
  r("driveCleanup.via.page", "stránka tohoto PDF", "a page of this PDF"),
  r("driveCleanup.via.export_name", "jméno exportu (slabá shoda)", "export name (weak match)"),
  r("driveCleanup.proposed.move", "přesunout", "move"),
  r("driveCleanup.proposed.trash", "smazat (kopie)", "delete (copy)"),
  r("driveCleanup.proposed.none", "ponechat / prověřit", "keep / review"),
  r("driveCleanup.done.move", "přesunuto ✓", "moved ✓"),
  r("driveCleanup.done.trash", "v koši ✓", "in the bin ✓"),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} drive cleanup keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
