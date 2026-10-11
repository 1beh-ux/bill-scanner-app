// Účastníci restructure (Dokumenty + Platby na účet + Poslat e-mail under Účastníci,
// Platba a účet in event settings, Šablony e-mailů, own e-mails).
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    // Renamed sections
    { key: "templatesPage.tabMail", cs: "Sledované dokumenty", en: "Tracked documents" },
    { key: "templatesPage.tabParticipants", cs: "Proměnné (sloupce)", en: "Variables (columns)" },
    { key: "templatesPage.tabEmails", cs: "Šablony e-mailů", en: "E-mail templates" },
    { key: "templatesPage.emailsSubtitle", cs: "Všechny e-maily, které aplikace posílá. Akce je mohou upravit pro sebe (Nastavení akce -> Mail).", en: "Every e-mail the app sends. Events can change them for themselves (Event settings -> Mail)." },
    { key: "bankPayments.title", cs: "Platby na účet", en: "Bank payments" },
    { key: "eventSettings.tabPayment", cs: "Platba a účet", en: "Payment and account" },
    { key: "eventDetail.registrationInfoTitle", cs: "Přihlášky", en: "Registrations" },
    // Platba a účet
    { key: "paymentSettings.priceTitle", cs: "Cena a účet pro platby", en: "Price and payment account" },
    { key: "paymentSettings.vsTitle", cs: "Variabilní symbol", en: "Variable symbol" },
    { key: "paymentSettings.qrTitle", cs: "QR kód pro platbu", en: "Payment QR code" },
    { key: "paymentSettings.confirmTitle", cs: "Potvrzení platby", en: "Payment confirmation" },
    { key: "paymentSettings.saved", cs: "Uloženo.", en: "Saved." },
    { key: "paymentSettings.movedHint", cs: "Nastavuje se v Nastavení akce ->", en: "Set in Event settings ->" },
    // Dokumenty: sync panel
    { key: "documentSync.button", cs: "Synchronizovat dokumenty", en: "Sync documents" },
    { key: "documentSync.running", cs: "Synchronizuji…", en: "Syncing…" },
    { key: "documentSync.connections", cs: "Připojené zdroje", en: "Connected sources" },
    { key: "documentSync.nothingConnected", cs: "Žádná tabulka ani složka není připojená.", en: "No sheet or folder is connected." },
    { key: "documentSync.sheet", cs: "Tabulka {name}", en: "Sheet {name}" },
    { key: "documentSync.drive", cs: "Kopie dokumentů na Disk", en: "Document copies to Drive" },
    { key: "documentSync.statusSheet", cs: "Tabulka stavu dokumentů", en: "Document status sheet" },
    { key: "documentSync.all", cs: "Synchronizace", en: "Sync" },
    { key: "documentSync.ok", cs: "hotovo", en: "done" },
    { key: "documentSync.failed", cs: "chyba ({code})", en: "failed ({code})" },
    { key: "documentSync.ticks", cs: "označuje „{document}“", en: "ticks “{document}”" },
    { key: "documentSync.dataOnly", cs: "jen údaje účastníků", en: "participant data only" },
    { key: "documentSync.lastAt", cs: "naposledy {when}", en: "last {when}" },
    { key: "documentSync.never", cs: "zatím nesynchronizováno", en: "not synced yet" },
    { key: "documentSync.auto", cs: "automaticky", en: "automatic" },
    { key: "documentSync.on", cs: "zapnuto", en: "on" },
    { key: "documentSync.off", cs: "vypnuto", en: "off" },
    { key: "documentSync.settingsLink", cs: "Nastavit připojení", en: "Set up connections" },
    // Poslat e-mail
    { key: "sendEmail.title", cs: "Poslat e-mail", en: "Send e-mail" },
    { key: "sendEmail.intro", cs: "Všechny e-maily akce na jednom místě. Vyberte e-mail vlevo.", en: "All of the event's e-mails in one place. Pick an e-mail on the left." },
    { key: "sendEmail.fromHere", cs: "Poslat odsud", en: "Send from here" },
    { key: "sendEmail.elsewhere", cs: "Spouští se jinde", en: "Launched elsewhere" },
    { key: "sendEmail.newOwn", cs: "Nový vlastní e-mail", en: "New own e-mail" },
    { key: "sendEmail.customWhat", cs: "Vlastní e-mail organizace nebo akce. Text se před odesláním dá ještě upravit.", en: "An own e-mail of the organization or event. You can still change the text before sending." },
    { key: "sendEmail.editTemplate", cs: "Upravit šablonu", en: "Edit template" },
    { key: "sendEmail.recipients", cs: "Komu", en: "To" },
    { key: "sendEmail.status.accepted", cs: "Přijatí", en: "Accepted" },
    { key: "sendEmail.status.pending", cs: "Nepřijatí", en: "Not accepted" },
    { key: "sendEmail.search", cs: "Hledat jméno…", en: "Search name…" },
    { key: "sendEmail.allGroups", cs: "Všechny skupiny", en: "All groups" },
    { key: "sendEmail.pickAll", cs: "Vybrat zobrazené", en: "Pick shown" },
    { key: "sendEmail.pickNone", cs: "Zrušit výběr", en: "Clear" },
    { key: "sendEmail.portalOnlyLinked", cs: "Jen účastníci propojení s Lidé – odkaz do portálu patří osobě.", en: "Only participants linked to People – the portal link belongs to the person." },
    { key: "sendEmail.nobody", cs: "Nikdo neodpovídá filtru.", en: "Nobody matches the filter." },
    { key: "sendEmail.noEmail", cs: "bez e-mailu", en: "no e-mail" },
    { key: "sendEmail.continue", cs: "Pokračovat ({count})", en: "Continue ({count})" },
    // E-mail types (src/lib/email-kinds.ts)
    { key: "emailKinds.blank.name", cs: "Prázdný e-mail", en: "Blank e-mail" },
    { key: "emailKinds.blank.what", cs: "E-mail s vlastním textem vybraným účastníkům (jejich zákonným zástupcům).", en: "An e-mail with your own text to the picked participants (their guardians)." },
    { key: "emailKinds.portalInvitation.name", cs: "Pozvánka do portálu / nový rok", en: "Portal invitation / new year" },
    { key: "emailKinds.portalInvitation.what", cs: "Pozvánka do rodičovského portálu (např. na nový rok) s osobním odkazem. Šablona je společná pro celou organizaci.", en: "An invitation to the parent portal (e.g. for the new year) with a personal link. The template is shared by the whole organization." },
    { key: "emailKinds.portalLink.name", cs: "Odkaz do portálu", en: "Portal link" },
    { key: "emailKinds.portalLink.what", cs: "Osobní odkaz do rodičovského portálu. Šablona je společná pro celou organizaci.", en: "The personal parent-portal link. The template is shared by the whole organization." },
    { key: "emailKinds.healthSummary.name", cs: "Zdravotní přehled", en: "Health summary" },
    { key: "emailKinds.healthSummary.what", cs: "Rodičům přijde přehled zdravotních údajů dítěte (PDF) ke kontrole.", en: "Parents get their child's health summary (PDF) to check." },
    { key: "emailKinds.healthSummary.where", cs: "Každý e-mail má v příloze PDF vytvořené pro konkrétní dítě, proto se posílá ze Zdraví.", en: "Each e-mail carries a PDF made for that child, so it's sent from Health." },
    { key: "emailKinds.healthSummary.open", cs: "Otevřít Zdraví -> Poslat přehledy", en: "Open Health -> Send summaries" },
    { key: "emailKinds.acceptance.name", cs: "Přijetí přihlášky", en: "Registration acceptance" },
    { key: "emailKinds.acceptance.what", cs: "Potvrzení přijetí s cenou, platebními údaji a dokumenty k vyplnění.", en: "The acceptance with price, payment details and documents to fill in." },
    { key: "emailKinds.acceptance.where", cs: "Odesláním se přihláška zároveň přijme a přidělí se variabilní symbol, proto se spouští v Seznamu účastníků: vyberte účastníky -> Přijmout a odeslat (nebo Poslat znovu).", en: "Sending also accepts the registration and assigns the variable symbol, so it's launched from the participant list: pick participants -> Accept and send (or Send again)." },
    { key: "emailKinds.acceptance.open", cs: "Otevřít Seznam účastníků", en: "Open the participant list" },
    { key: "emailKinds.documentStatus.name", cs: "Stav dokumentů", en: "Document status" },
    { key: "emailKinds.documentStatus.what", cs: "Rodičům přijde přehled, které dokumenty už máme a které chybí.", en: "Parents get a list of the documents received and missing." },
    { key: "emailKinds.documentStatus.where", cs: "Obsah se skládá ze stavu dokumentů každého účastníka, proto se posílá z Dokumentů tlačítkem „Poslat stav dokumentů“.", en: "The content is built from each participant's document status, so it's sent from Documents with “Send document status”." },
    { key: "emailKinds.documentStatus.open", cs: "Otevřít Dokumenty", en: "Open Documents" },
    { key: "emailKinds.mailReply.name", cs: "Odpověď na e-mail", en: "E-mail reply" },
    { key: "emailKinds.mailReply.what", cs: "Odpověď rodiči na jeho e-mail s dokumenty (co přišlo, co chybí).", en: "A reply to a parent's e-mail with documents (what arrived, what's missing)." },
    { key: "emailKinds.mailReply.where", cs: "Je to odpověď na konkrétní přijatý e-mail, proto se posílá z Pošty u toho e-mailu.", en: "It answers one received e-mail, so it's sent from Mail on that e-mail." },
    { key: "emailKinds.mailReply.open", cs: "Otevřít Poštu", en: "Open Mail" },
    { key: "emailKinds.orgOnlyHint", cs: "Tento e-mail se posílá lidem z Lidé, šablona je společná pro celou organizaci.", en: "This e-mail goes to people in People; the template is shared by the whole organization." },
    { key: "emailKinds.editInOrg", cs: "Upravit v Šablony -> Šablony e-mailů", en: "Edit in Templates -> E-mail templates" },
    { key: "emailKinds.needs.health", cs: "Upravit lze s přístupem k modulu Zdraví.", en: "Editable with access to the Health module." },
    { key: "emailKinds.needs.mail", cs: "Upravit lze s přístupem k modulu Pošta.", en: "Editable with access to the Mail module." },
    { key: "emailKinds.needs.roster", cs: "Upravit lze s přístupem k účastníkům.", en: "Editable with access to participants." },
    // Own e-mails
    { key: "customEmails.title", cs: "Vlastní e-maily", en: "Own e-mails" },
    { key: "customEmails.new", cs: "Nový e-mail", en: "New e-mail" },
    { key: "customEmails.hintOrg", cs: "Vlastní šablony (např. Pozvánka na akci, Informace před odjezdem) pro všechny akce. Posílají se z Účastníci -> Poslat e-mail.", en: "Own templates (e.g. Event invitation, Info before departure) for every event. Sent from Participants -> Send e-mail." },
    { key: "customEmails.hintEvent", cs: "E-maily organizace (každý lze pro tuto akci upravit) a e-maily jen této akce. Posílají se z Účastníci -> Poslat e-mail.", en: "The organization's e-mails (each can be changed for this event) and e-mails of this event only. Sent from Participants -> Send e-mail." },
    { key: "customEmails.name", cs: "Název", en: "Name" },
    { key: "customEmails.namePlaceholder", cs: "např. Pozvánka na akci", en: "e.g. Event invitation" },
    { key: "customEmails.create", cs: "Vytvořit", en: "Create" },
    { key: "customEmails.createFailed", cs: "Nepovedlo se vytvořit.", en: "Couldn't create it." },
    { key: "customEmails.empty", cs: "Zatím žádné vlastní e-maily.", en: "No own e-mails yet." },
    { key: "customEmails.eventOnly", cs: "jen tato akce", en: "this event only" },
    { key: "customEmails.deleteConfirm", cs: "Smazat e-mail „{name}“?", en: "Delete the e-mail “{name}”?" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} účastníci/mail keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
