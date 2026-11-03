// 2026-11-03: each Drive export in its own folder; Vyúčtování settings in Nastavení akce; four message variants. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("driveSettings.groupImport", "Import účtenek", "Bill import"),
  r("driveSettings.groupExport", "Export", "Export"),
  r("driveSettings.groupExportHint", "Každý export má svou složku; prázdná = složka účtenek.", "Each export has its own folder; empty = the bills folder."),
  r("driveSettings.folderFallbackPlaceholder", "prázdné = složka účtenek", "empty = the bills folder"),
  r("driveSettings.exportFolderLabel", "Účtenky – soubory (hlavní složka exportu)", "Bills – files (the main export folder)"),
  r("driveSettings.manifestFolderLabel", "Přehled účtenek (manifest)", "Bills overview (manifest)"),
  r("driveSettings.healthFolderLabel", "Zdraví – PDF souhrny pro rodiče", "Health – PDF summaries for parents"),
  r("driveSettings.participantsListFolderLabel", "Seznam účastníků (tabulka)", "Attendee list (sheet)"),
  r("driveSettings.planningFolderLabel", "Program (tabulka)", "Programme (sheet)"),
  r("driveSettings.ticketsFolderLabel", "Vstupenky (tabulka)", "Tickets (sheet)"),
  r("driveSettings.folder.manifest", "Složka přehledu účtenek", "Bills overview folder"),
  r("driveSettings.folder.health", "Složka zdravotních souhrnů", "Health summaries folder"),
  r("driveSettings.folder.participantsList", "Složka seznamu účastníků", "Attendee list folder"),
  r("driveSettings.folder.planning", "Složka programu", "Programme folder"),
  r("driveSettings.folder.tickets", "Složka vstupenek", "Tickets folder"),

  r("settlementLinks.settingsTab", "Osobní účtenky a platby", "Personal bills and payments"),
  r("settlementLinks.treasurerTitle", "Pokladník", "Treasurer"),
  r("settlementLinks.receiverShort", "Lidé platí na: {name}", "People pay to: {name}"),
  r("settlementLinks.autoShortOn", "potvrzení automaticky (Fio)", "confirmed automatically (Fio)"),
  r("settlementLinks.autoShortOff", "potvrzení ručně", "confirmed by hand"),
  r("settlementLinks.settingsButton", "Nastavení vyúčtování", "Settlement settings"),
  r("settlementLinks.text.owes", "Jen útraty – dluží nám", "Only spending – they owe us"),
  r("settlementLinks.text.owed", "Jen platil(a) za akci – posíláme mu/jí", "Only paid for the event – we pay them"),
  r("settlementLinks.text.bothOwes", "Obojí (platil(a) i útraty) – po započtení dluží nám", "Both (paid and spent) – after netting they owe us"),
  r("settlementLinks.text.bothOwed", "Obojí (platil(a) i útraty) – po započtení posíláme mu/jí", "Both (paid and spent) – after netting we pay them"),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} drive folders / settlement settings keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
