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
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} audit 2026-11 keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
