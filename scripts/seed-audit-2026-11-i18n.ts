// Audit fixes 2026-11-05 (docs/bill-scanner-v2-claude-code-prompt-8-audit-fixes-2026-11-05.md). cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  // Phase 2: permissions
  r("eventSettings.adminManaged", "Tohle upravuje správce organizace.", "An organization admin manages this."),
  // Phase 3: bank import window
  r("bankImport.window", "Období akce {from} – {to}", "Event period {from} – {to}"),
  r("bankImport.outsideHint", "{count} řádků je mimo období akce ({from} – {to}), proto se nenačtou. Patří-li k akci, rozšiřte data u propojení účtu nahoře (Období) a náhled spusťte znovu.", "{count} rows are outside the event period ({from} – {to}), so they won't be imported. If they belong to the event, widen the account link's dates above (Period) and run the preview again."),
  // Phase 4: kitchen diet safety
  r("kitchen.dietWarnings.title", "Pozor: v alergiích jsou výrazy, které aplikace nepřiřadila – čtěte text rodičů", "Careful: allergy texts contain words the app couldn't match – read the parents' text"),
  r("kitchen.dietWarnings.chip", "text obsahuje nepřiřazené výrazy: {words}", "the text has unmatched words: {words}"),
  r("kitchen.dietWarnings.unconfirmed", "zatím neověřeno", "not confirmed yet"),
  r("kitchen.dietWarnings.reviewedLabel", "Nepřiřazené výrazy ({words}) jsem posoudil/a", "I've checked the unmatched words ({words})"),
  r("kitchen.dietWarnings.needsReview", "Text obsahuje nepřiřazené výrazy: napište poznámku, nebo zaškrtněte, že jste je posoudil/a.", "The text has unmatched words: write a note, or tick that you've checked them."),
  r("kitchen.dietWarnings.saveFailed", "Uložení se nepodařilo.", "Saving failed."),
  r("kitchen.dietWarnings.reviewedNote", "Nepřiřazené výrazy posouzeny: {note}", "Unmatched words checked: {note}"),
  r("kitchen.dietWarnings.reviewedTick", "Nepřiřazené výrazy posouzeny (zaškrtnuto při potvrzení).", "Unmatched words checked (ticked at confirmation)."),
  // Phase 5: naming, bank accounts in one place, Připojení sections
  r("connections.subtitle", "Kam je organizace připojená: veřejné adresy přihlášek a portálu, a bankovní účty s tokeny Fio.", "What the organization is connected to: the public addresses of registrations and the portal, and the bank accounts with Fio tokens."),
  r("bankAccounts.title", "Banka – účty a tokeny Fio", "Bank – Fio accounts and tokens"),
  r("bankAccounts.subtitle", "Jediné místo pro účty Fio a jejich tokeny. Čte z nich kontrola plateb přihlášek i Banka (párování u akcí); u akce se účet jen připojí.", "The one place for Fio accounts and their tokens. Both the registration payment check and Banka (event reconciliation) read from here; an event only links the account."),
  r("bankAccounts.kind.label", "Typ účtu", "Account type"),
  r("bankAccounts.kind.organization", "účet organizace", "organization account"),
  r("bankAccounts.kind.personal", "osobní účet", "personal account"),
  r("bankAccounts.personalLinkedWarning", "Osobní účet je připojený k akcím – pohyby z něj uvidí každý s přístupem k Bance nebo kontrolou plateb těch akcí.", "A personal account is linked to events – everyone with Banka or payment-check access on those events sees its movements."),
  r("bankAccounts.linkedInBank", "Banka u akcí: {events}", "Banka on events: {events}"),
  r("bankAccounts.manageLink", "Spravovat účty a tokeny →", "Manage accounts and tokens →"),
  r("bankAccounts.manageByAdmin", "Token nastavuje správce organizace v Organizace → Připojení.", "An organization admin sets the token in Organization → Connections."),
  r("bankAccounts.fioInConnections", "Účet Fio s tokenem se zakládá v Organizace → Připojení; tady ho jen připojíte k akci (nebo založíte zdroj z Google Sheetu či souboru).", "A Fio account with its token is created in Organization → Connections; here you only link it to the event (or create a Google Sheet / file source)."),
  r("bankAccountsPage.error.fio_in_connections", "Účet Fio založte v Organizace → Připojení a pak ho tu připojte.", "Create the Fio account in Organization → Connections, then link it here."),
  r("testEvent.checkbox", "Testovací akce", "Test event"),
  r("testEvent.hint", "Na zkoušení: její účastníci se nepropojí do Lidí, nenabídne se v portálu ani ve výběrech jiných akcí a nepočítá se do Využití.", "For trying things out: its participants aren't linked into People, it isn't offered in the portal or other events' pickers and doesn't count in Usage."),
  r("testEvent.badge", "TEST", "TEST"),
  // Phase 6 U1: the readiness checklist names what is still to do as a task.
  r("eventDetail.checklistDriveTask", "Připojit složku pro export účtenek na Disku", "Connect the bills export folder in Drive"),
  r("eventDetail.checklistProcessedFolderTask", "Nastavit složku Zpracované soubory", "Set the Processed files folder"),
  r("eventDetail.checklistMailboxTask", "Připojit schránku", "Connect the mailbox"),
  r("eventDetail.checklistCategoriesTask", "Přidat kategorie účtenek", "Add bill categories"),
  r("eventDetail.checklistBudgetsTask", "Vyplnit rozpočty kategorií", "Fill in the category budgets"),
  r("eventDetail.checklistParticipantsFolderTask", "Připojit složku pro Účastníky a Poštu", "Connect the Participants & mail folder"),
  r("eventDetail.checklistDocumentTypesTask", "Přidat typy dokumentů", "Add document types"),
  r("eventDetail.checklistTicketTypesTask", "Nastavit druhy vstupenek a ceny", "Set the ticket types and prices"),
  r("eventDetail.checklistRegistrationAccountTask", "Zadat účet pro platby přihlášek", "Enter the account for registration payments"),
  r("eventDetail.checklistPriceTask", "Zadat cenu akce", "Enter the event price"),
  r("eventDetail.checklistLocationTask", "Zadat místo konání", "Enter the location"),
  r("eventDetail.checklistPublicSlugTask", "Zvolit adresu veřejné přihlášky", "Choose the public registration address"),
  r("eventDetail.checklistBankAccountTask", "Vybrat bankovní účet pro kontrolu plateb", "Pick the bank account for the payment check"),
  r("eventDetail.checklistPaymentDocTask", "Vybrat dokument, který se zaškrtne po zaplacení", "Pick the document ticked when paid"),
  r("eventDetail.checklistDeadlineTask", "Zadat uzávěrku přihlášek", "Enter the registration deadline"),
  r("eventDetail.checklistDone", "hotovo", "done"),
  r("eventDetail.checklistTodo", "zbývá udělat", "still to do"),
  // Phase 6 U6 / U7: participant import
  r("participantSync.guardianEmailTarget", "E-mail zákonného zástupce", "Guardian e-mail"),
  r("participantSync.result.row", "Řádek", "Row"),
  r("participantSync.result.name", "Jméno", "Name"),
  r("participantSync.result.status", "Výsledek", "Result"),
  r("participantSync.result.reason", "Důvod", "Reason"),
  r("participantSync.result.downloadErrors", "Stáhnout řádky s problémem (CSV, {count})", "Download the problem rows (CSV, {count})"),
  r("participantSync.error.save_failed", "uložení selhalo", "saving failed"),
  // Phase 6 U9
  r("participantsPage.acceptButton", "Přijmout", "Accept"),
  // Phase 6 PL1
  r("planBoard.emptyIntro", "Program skládáte po dnech z knihovny aktivit: přidejte den a přetáhněte do něj aktivity.", "You build the programme day by day from the activity library: add a day and drag activities into it."),
  r("planBoard.copyHint", "Přetažení přesouvá · s Alt/Ctrl kopíruje · přetažení na aktivitu = souběžně · spodní hrana mění délku · na dotyku nebo klávesnici: klepněte na aktivitu → Přesunout nebo kopírovat (i souběžně).", "Dragging moves · with Alt/Ctrl it copies · dropping on an activity = in parallel · the bottom edge changes the length · on touch or keyboard: tap the activity → Move or copy (in parallel too)."),
  // Phase 6 SET1
  r("settingsPage.sectionAppearance", "Vzhled a jazyk", "Appearance and language"),
  r("settingsPage.sectionMenu", "Menu", "Menu"),
  r("settingsPage.sectionEmails", "E-maily", "E-mails"),
  r("settingsPage.landingSavedBelow", "Uloží se tlačítkem Uložit dole.", "Saved with the Save button below."),
  r("billDriveSync.askAdmin", "Požádejte správce organizace o připojení Disku.", "Ask an organization admin to connect Drive."),
  // Edited in older seeds that deploy.sh doesn't run (U2, Lidé naming): repeated here so they reach production.
  r("mailTab.questionnaireHint", "Odkaz je dostupný jako {questionnaire_url} v e-mailech i dokumentech. Vyplnění dotazníku značte ručně jako typ dokumentu (Šablony → Pošta).", "The link is available as {questionnaire_url} in both emails and documents. Track completion manually as a document type (Templates → Mail)."),
  r("children.intro", "Lidé napříč všemi akcemi a roky — děti, dospělí i dospělí mimo organizaci. Účastníci se k osobě propojují podle jména a data narození. Používá se jen u akcí, které mají zapnuté „Připojeno k registraci“ — ostatní akce fungují beze změny.", "People across all events and years — children, adults and adults from outside the organization. Participants are linked by name and birth date. Only used by events with “Connected to registration” on — other events work unchanged."),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} audit 2026-11 keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
