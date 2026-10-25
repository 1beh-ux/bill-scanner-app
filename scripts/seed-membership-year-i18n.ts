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
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} membership-year keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
