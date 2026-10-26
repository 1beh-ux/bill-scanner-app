// 2026-10-25: membership year per event, "existing people only" public registrations + Nabídnout portál,
// files on every e-mail. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("membershipYear.title", "Členství", "Membership"),
  r("membershipYear.hint", "Ze kterého členského roku akce bere členství: členská cena, číslice členství ve VS, pole „Členství (rok akce)“ a „Je členem“ v seznamech, dokumentech a e-mailech. Členem je, kdo má přijatou přihlášku v Registraci (Členský rok) daného roku.", "Which membership year the event takes membership from: member price, the membership digit of the variable symbol, the “Členství (rok akce)” field and “Je členem” in lists, documents and e-mails. A member is anyone with an accepted registration in that year's Registrace (membership year)."),
  r("membershipYear.label", "Rok členství", "Membership year"),
  r("membershipYear.auto", "Podle začátku akce ({year})", "By the event's start ({year})"),
  r("membershipYear.source", "Členství {year} se bere z: {events}.", "Membership {year} comes from: {events}."),
  r("membershipYear.noSource", "Pro rok {year} zatím žádná Registrace (Členský rok) není – nikdo se nepočítá jako člen z registrace.", "There's no Registrace (membership year) for {year} yet – nobody counts as a member from a registration."),
  r("membershipYear.notConnected", "Akce není připojená k registraci (Portál rodičů → Připojeno k registraci): účastníci nejsou propojeni se Členy, takže členství z registrace se nepozná.", "The event isn't connected to registration (Parent portal → Connected to registration): participants aren't linked to Members, so membership from the registration can't be told."),
  r("registrationSettings.linkModeHint.existing", "Propojí jen účastníky, kteří už ve Členech jsou; nikoho nového nepřidá. Veřejná přihláška pak vytvoří jen účastníka akce (bez osoby a bez portálu) – podrobnosti doplní po přijetí na osobním odkazu ({{details_link}}). Do portálu je lze pozvat ručně: v seznamu účastníků je vyberte → Nabídnout portál.", "Links only participants already in Members; adds nobody new. The public form then creates only the event's participant (no person, no portal) – the details come after acceptance on a personal link ({{details_link}}). Invite them to the portal by hand: pick them in the participant list → Offer the portal."),
  r("participantsPage.offerPortal", "Nabídnout portál", "Offer the portal"),
  r("participantsPage.offerPortalHint", "Vybraní, kteří ještě nejsou ve Členech, se tam přidají; pak se otevře Pozvánka do portálu k odeslání.", "The picked ones not in Members yet are added there; then the portal invitation opens to be sent."),
  r("participantsPage.offerPortalNone", "Nikoho z vybraných nelze přidat do Členů (chybí datum narození?).", "None of the picked can be added to Members (missing birth date?)."),
  r("emailFiles.title", "Přiložené soubory", "Attached files"),
  r("emailFiles.hint", "Půjdou s každým odesláním tohoto e-mailu (ve všech akcích). Nejvýš 10 souborů, každý do 10 MB.", "Go with every send of this e-mail (in every event). At most 10 files, 10 MB each."),
  r("emailFiles.hintEvent", "Půjdou s tímto e-mailem jen v této akci – spolu se soubory organizace (Šablony → E-maily). Nejvýš 10 souborů, každý do 10 MB.", "Go with this e-mail in this event only – together with the organization's files (Templates → E-mails). At most 10 files, 10 MB each."),
  r("emailFiles.fromOrg", "z organizace", "from the organization"),
  r("emailFiles.add", "Přidat soubor", "Add a file"),
  r("emailFiles.remove", "Odebrat", "Remove"),
  r("emailFiles.tooLarge", "Soubor je větší než 10 MB.", "The file is larger than 10 MB."),
  r("emailFiles.tooMany", "Víc než 10 souborů u jednoho e-mailu nejde.", "No more than 10 files per e-mail."),
  // 2026-10-25 b: the participant export also mirrors the received files.
  r("participantsPage.driveExportHint", "Uloží seznam účastníků se všemi údaji, které vidíte, a se stavem dokumentů jako tabulku „Účastníci – název akce“ do složky pro export na Google Disku (kde je i přehled účtenek); další export ji přepíše. Přijaté soubory (e-mailem, ručně, schválené z portálu) nahraje do složky účastníků – každý účastník má svou složku, soubor má v názvu „_prijato“.", "Saves the participant list with every detail you see and the documents' state as the sheet “Účastníci – event name” in the export folder on Google Drive (next to the bills overview); the next export overwrites it. Received files (by e-mail, by hand, approved from the portal) go to the participants folder – a folder per participant, “_prijato” in the file name."),
  r("participantsPage.driveExportFiles", "Soubory na Disk: nově {synced}, nepovedlo se {skipped}.", "Files to Drive: {synced} new, {skipped} failed."),
  // 2026-10-26: acceptance for participants not in Členové, status e-mail with the link.
  r("emailKinds.acceptancePage.what", "Posílá se místo běžného přijetí účastníkům, kteří nejsou ve Členech (akce s portálem): odkaz na osobní stránku přihlášky ({{details_link}}) a co na ní najdou – údaje k doplnění, dokumenty, platbu.", "Sent instead of the usual acceptance to participants not in Members (events with the portal): the link to the registration's own page ({{details_link}}) and what's there – details to fill in, documents, payment."),
  r("emailKinds.acceptancePage.where", "Posílá se samo při přijetí (Přijmout a odeslat, automatické přijetí, Poslat znovu) – podle toho, jestli je účastník propojený se Členy.", "Goes on its own on acceptance (Accept and send, automatic acceptance, Send again) – by whether the participant is linked to Members."),
  r("emailKinds.acceptancePage.open", "Otevřít Seznam účastníků", "Open the participant list"),
  r("emailKinds.documentStatusLink.what", "Přehled dokumentů jako „Stav dokumentů“ a k tomu odkaz, kde je doplnit a zaplatit: členům rodinný portál, ostatním osobní stránku přihlášky ({{details_link_line}}).", "The document list like “Document status”, plus the link where to complete and pay: the family portal for members, the registration's own page for others ({{details_link_line}})."),
  r("emailKinds.documentStatusLink.open", "Otevřít Stav dokumentů", "Open Document status"),
  r("statusUpdate.linkHint", "Členové dostanou odkaz do rodinného portálu, ostatní na osobní stránku přihlášky.", "Members get the family portal link, others the registration's own page."),
  // 2026-10-26 b: a template per case at organization level; an event uses (and lists) the ones of its case.
  r("emailKinds.acceptance.name", "Přijetí přihlášky – akce bez portálu", "Registration acceptance – event without the portal"),
  r("emailKinds.acceptancePortal.name", "Přijetí přihlášky – akce s portálem (členové)", "Registration acceptance – event with the portal (members)"),
  r("emailKinds.acceptancePortal.what", "Přijetí v akci s rodičovským portálem pro ty, kdo jsou ve Členech: s odkazem do portálu ({{details_link_line}}), kde uvidí, co chybí, a platbu.", "The acceptance in an event with the parent portal for people in Members: with the portal link ({{details_link_line}}), where they see what's missing and the payment."),
  r("emailKinds.acceptancePortal.where", "Posílá se samo místo „akce bez portálu“, když je akce připojená k registraci (nebo je to Členský rok): Přijmout a odeslat, automatické přijetí, Poslat znovu.", "Goes on its own instead of “event without the portal” when the event is connected to registration (or is a membership year): Accept and send, automatic acceptance, Send again."),
  r("emailKinds.acceptancePortal.open", "Otevřít Seznam účastníků", "Open the participant list"),
  r("emailKinds.acceptancePage.name", "Přijetí přihlášky – akce s portálem (nečlenové, osobní stránka)", "Registration acceptance – event with the portal (non-members, own page)"),
  r("emailKinds.documentStatus.name", "Stav dokumentů – akce bez portálu", "Document status – event without the portal"),
  r("emailKinds.documentStatusLink.name", "Stav dokumentů – akce s portálem (s odkazem)", "Document status – event with the portal (with the link)"),
  r("emailKinds.documentStatusLink.where", "Posílá se ze stránky Stav dokumentů – v akci s portálem se použije sama místo „akce bez portálu“.", "Sent from the Document status page – in an event with the portal it's used on its own instead of “event without the portal”."),
  r("compose.acceptancePageNote", "Účastníci, kteří nejsou ve Členech, dostanou místo tohoto textu šablonu „Přijetí přihlášky – akce s portálem (nečlenové, osobní stránka)“.", "Participants not in Members get the “Registration acceptance – event with the portal (non-members, own page)” template instead of this text."),
  r("statusUpdate.templateUsed", "Šablona: {name}.", "Template: {name}."),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} membership-year keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
