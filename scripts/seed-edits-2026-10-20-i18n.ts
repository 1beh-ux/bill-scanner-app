// Edits 2026-10-20: event name + dates in Nastavení akce -> Akce; hiding the public page heading. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("eventBasics.title", "Název a termín", "Name and dates"),
  r("eventBasics.name", "Název akce", "Event name"),
  r("eventBasics.start", "Začátek", "Start"),
  r("eventBasics.end", "Konec", "End"),
  r("eventBasics.hint", "Nový termín se použije v e-mailech, dokumentech a vstupenkách vytvořených od teď; už odeslané zůstávají, jak byly.", "The new dates apply to e-mails, documents and tickets made from now on; ones already sent stay as they were."),
  r("eventBasics.saved", "Uloženo.", "Saved."),
  r("publicSettings.hideHeader", "Skrýt nadpis a údaje o akci", "Hide the heading and event details"),
  r("publicSettings.hideHeaderHint", "Formulář začne rovnou textem a políčky – bez názvu organizace, názvu akce a termínu. Hodí se, když stránka, kam ho vkládáte, má vlastní nadpis.", "The form starts straight with the text and fields – no organization name, event name or dates. Useful when the page you embed it on has its own heading."),
  r("ticketSettings.textsTitle", "Texty na webu", "Texts on the web"),
  r("ticketSettings.textsHint", "Vlastní znění textů formuláře vstupenek a potvrzení po objednání (na veřejné stránce i v portálu). Prázdné pole = výchozí text, který je v něm vidět šedě. Údaje ve složených závorkách, např. {number}, {total}, {max}, {left}, {date}, {email}, se doplní samy.", "Your own wording of the ticket form and the confirmation after ordering (on the public page and in the portal). Empty = the default text shown grey in it. Values in curly braces, e.g. {number}, {total}, {max}, {left}, {date}, {email}, are filled in."),
  r("ticketSettings.textsAfter", "Po odeslání objednávky", "After the order is sent"),
  r("ticketSettings.showLeft", "Ukazovat, kolik vstupenek zbývá („zbývá 12“)", "Show how many tickets are left (“12 left”)"),
  r("tickets.actDelete", "Smazat", "Delete"),
  r("tickets.confirmDelete", "Smazat zrušenou objednávku č. {number} ({name}) natrvalo, i s jejími vstupenkami? Vrátit to nejde. Pokud je to poslední objednávka, další nová dostane znovu její číslo a variabilní symbol.", "Delete the cancelled order no. {number} ({name}) for good, with its tickets? This can't be undone. If it's the latest order, the next new one gets its number and variable symbol again."),
  r("tickets.error.not_cancelled", "Smazat jde jen zrušenou objednávku.", "Only a cancelled order can be deleted."),
  r("tickets.error.admin_only", "Mazat může jen administrátor organizace.", "Only an organization admin can delete."),
  r("ticketSettings.textDefault", "Výchozí: {text}", "Default: {text}"),
  r("participantsPage.driveExport", "Export na Disk", "Export to Drive"),
  r("participantsPage.driveExporting", "Exportuji…", "Exporting…"),
  r("participantsPage.driveExportHint", "Uloží seznam účastníků se všemi údaji, které vidíte, jako tabulku „Účastníci – název akce“ do složky pro export na Google Disku (kde je i přehled účtenek). Další export ji přepíše.", "Saves the participant list with every detail you can see as the sheet “Účastníci – event name” in the Google Drive export folder (next to the bills overview). The next export overwrites it."),
  r("participantsPage.driveExportDone", "Exportováno účastníků: {count}.", "Participants exported: {count}."),
  r("participantsPage.driveExportOpen", "Otevřít tabulku", "Open the sheet"),
  r("participantsPage.driveExportNoFolder", "Akce nemá nastavenou složku pro export (Nastavení akce → Připojení na Google).", "The event has no export folder (Event settings → Google connection)."),
  r("tickets.status.entered", "Prošli u vchodu", "Checked in"),
  r("tickets.scanLine", "{seq}. {type} – {when}", "{seq}. {type} – {when}"),
  r("tickets.driveExportHint", "Uloží objednávky (kupující, kontakty, vstupenky, stav, platba, odeslání a vstup u vchodu) jako tabulku „Vstupenky – název akce“ do složky pro export na Google Disku (kde je i přehled účtenek). Další export ji přepíše.", "Saves the orders (buyers, contacts, tickets, state, payment, sending and check-in) as the sheet “Vstupenky – event name” in the Google Drive export folder (next to the bills overview). The next export overwrites it."),
  r("tickets.driveExportDone", "Exportováno objednávek: {count}.", "Orders exported: {count}."),
  r("eventBasics.badDates", "Konec nesmí být před začátkem.", "The end can't be before the start."),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} edits 2026-10-20 keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
