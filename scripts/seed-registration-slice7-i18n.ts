// Registration & membership, slice 7 (docs/registration-slice7-spec.md): bulk
// import of permanent documents from a Drive folder (event → Dokumenty).
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    { key: "eventSettings.tabPortal", cs: "Portál rodičů", en: "Parent portal" },
    { key: "eventSettings.tabPublic", cs: "Veřejná přihláška", en: "Public registration" },
    { key: "publicTab.notConnected", cs: "Veřejná přihláška je jen pro rok členství nebo akci propojenou s Lidmi — zapněte propojení v sekci Portál rodičů.", en: "The public registration page is only for a membership year or an event connected to People — switch the connection on under Parent portal." },
    { key: "peopleUnlink.title", cs: "Odpojit od Lidí", en: "Disconnect from People" },
    { key: "peopleUnlink.hint", cs: "Propojených účastníků: {count}. Odpojením se zruší jejich propojení s osobami v Lidech a akce se už nikdy automaticky nepropojí (ani tlačítkem Propojit v Lidech). Účastníci v akci i osoby v Lidech zůstanou, nic se neodesílá.", en: "Linked participants: {count}. Disconnecting removes their links to people in People and the event is never linked automatically again (not even by Link in People). Participants and people both stay; nothing is sent." },
    { key: "peopleUnlink.button", cs: "Odpojit akci od Lidí", en: "Disconnect event from People" },
    { key: "peopleUnlink.confirm", cs: "Odpojit {count} účastníků od osob v Lidech? Vypne se i propojení akce (portál rodičů ji neuvidí). Účastníci i osoby zůstanou.", en: "Disconnect {count} participants from their people? The event's connection is switched off too (the parent portal won't show it). Participants and people stay." },
    { key: "peopleUnlink.isUnlinked", cs: "Akce je odpojená od Lidí: účastníci se s osobami nepropojují a nikomu z nich se z portálu nic neposílá.", en: "The event is disconnected from People: participants aren't linked to people and the portal sends them nothing." },
    { key: "peopleUnlink.allow", cs: "Znovu povolit propojení", en: "Allow linking again" },
    { key: "mdToolbar.heading", cs: "Nadpis", en: "Heading" },
    { key: "mdToolbar.subheading", cs: "Menší nadpis", en: "Subheading" },
    { key: "mdToolbar.bold", cs: "Tučně", en: "Bold" },
    { key: "mdToolbar.italic", cs: "Kurzíva", en: "Italic" },
    { key: "mdToolbar.bullet", cs: "Odrážka", en: "Bullet" },
    { key: "mdToolbar.subBullet", cs: "Odrážka 2. úrovně", en: "Second-level bullet" },
    { key: "mdToolbar.numbered", cs: "Číslovaný seznam", en: "Numbered list" },
    { key: "mdToolbar.link", cs: "Odkaz", en: "Link" },
    { key: "mdToolbar.preview", cs: "Náhled", en: "Preview" },
    { key: "mdToolbar.edit", cs: "Upravit", en: "Edit" },
    { key: "publicSettings.landingHint", cs: "Formátování přes tlačítka nahoře, nebo ručně: ## nadpis, **tučně**, *kurzíva*, - odrážka, „  - “ (2 mezery) odrážka 2. úrovně, 1. číslovaný seznam, [odkaz](https://…).", en: "Format with the buttons above, or by hand: ## heading, **bold**, *italic*, - bullet, “  - ” (2 spaces) second-level bullet, 1. numbered list, [link](https://…)." },
    { key: "driveDocImport.button", cs: "Importovat z Drive", en: "Import from Drive" },
    { key: "driveDocImport.title", cs: "Importovat z Drive: {name}", en: "Import from Drive: {name}" },
    { key: "driveDocImport.hint", cs: "Soubory přímo ve složce (bez podsložek) se uloží do profilů lidí v Lidé jako jejich platný trvalý dokument. Akce slouží jen jako připojení k Drive. Nic se neposílá e-mailem.", en: "Files directly in the folder (no subfolders) are stored in people's profiles (People) as their valid permanent document. The event only provides the Drive connection. Nothing is e-mailed." },
    { key: "driveDocImport.folderPlaceholder", cs: "Odkaz na složku Google Drive nebo její ID", en: "Google Drive folder link or ID" },
    { key: "driveDocImport.load", cs: "Načíst", en: "Load" },
    { key: "driveDocImport.identity", cs: "Drive čte účet {email} (připojení této akce).", en: "Drive is read as {email} (this event's connection)." },
    { key: "driveDocImport.empty", cs: "Ve složce nejsou žádné soubory.", en: "The folder has no files." },
    { key: "driveDocImport.file", cs: "Soubor", en: "File" },
    { key: "driveDocImport.statusHeader", cs: "Stav", en: "Status" },
    { key: "driveDocImport.person", cs: "Osoba", en: "Person" },
    { key: "driveDocImport.skip", cs: "Přeskočit", en: "Skip" },
    { key: "driveDocImport.open", cs: "otevřít", en: "open" },
    { key: "driveDocImport.status.matched", cs: "✓", en: "✓" },
    { key: "driveDocImport.status.multiple", cs: "více možností", en: "several options" },
    { key: "driveDocImport.status.unmatched", cs: "nespárováno", en: "unmatched" },
    { key: "driveDocImport.status.already", cs: "už importováno", en: "already imported" },
    { key: "driveDocImport.status.skipped", cs: "přeskočeno", en: "skipped" },
    { key: "driveDocImport.reason.native", cs: "Soubor Google, který nejde převést do PDF", en: "Google file that can't be converted to PDF" },
    { key: "driveDocImport.reason.type", cs: "Jen PDF, JPG nebo PNG", en: "PDF, JPG or PNG only" },
    { key: "driveDocImport.reason.size", cs: "Větší než 15 MB", en: "Larger than 15 MB" },
    { key: "driveDocImport.inEvent", cs: "na akci", en: "in this event" },
    { key: "driveDocImport.confirm", cs: "Importovat ({count})", en: "Import ({count})" },
    { key: "driveDocImport.progress", cs: "Importováno {done} z {total}", en: "Imported {done} of {total}" },
    { key: "driveDocImport.imported", cs: "importováno", en: "imported" },
    { key: "driveDocImport.error.not_found", cs: "Osoba nebo soubor nenalezen", en: "Person or file not found" },
    { key: "driveDocImport.error.bad_file", cs: "Není to PDF, JPG ani PNG do 15 MB", en: "Not a PDF, JPG or PNG up to 15 MB" },
    { key: "driveDocImport.error.already", cs: "Už importováno (stejný soubor)", en: "Already imported (same file)" },
    { key: "driveDocImport.error.failed", cs: "Import selhal", en: "Import failed" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} registration slice 7 keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
