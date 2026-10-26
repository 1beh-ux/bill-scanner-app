// 2026-10-27: portal card pills, Členové columns, export columns, membership offer, copy from person 1. cs + en.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

type Row = { key: string; cs: string; en: string };
const r = (key: string, cs: string, en: string): Row => ({ key, cs, en });

const rows: Row[] = [
  r("portal.details", "Podrobnosti k platbě a dokumentům", "Payment and document details"),
  r("portal.pillDocs", "Dokumenty {done}/{total}", "Documents {done}/{total}"),
  r("portal.pillDetailsMissing", "Údaje: chybí {n}", "Details: {n} missing"),
  r("portal.pillDetailsDone", "Údaje doplněny", "Details complete"),
  r("portal.ageAdult", "dospělý", "adult"),
  r("portal.ageChild", "dítě", "child"),
  r("profileSections.memberList", "Ve seznamu Členů", "In the Members list"),
  r("public.copyFromFirst", "Vyplnit stejné údaje jako osoba 1", "Fill in the same details as person 1"),
  r("public.offerTitle", "Předvyplníme údaje z vaší přihlášky", "We'll pre-fill the details from your registration"),
  r("public.offerHint", "Zadejte datum narození přihlášeného – doplníme jméno, údaje a kontakty, které už máme. Pak je zkontrolujte a přihlášku odešlete.", "Enter the registered person's birth date – we'll fill in the name, details and contacts we already have. Then check them and send the form."),
  r("public.offerFill", "Předvyplnit", "Pre-fill"),
  r("public.offerDone", "Údaje jsou předvyplněné – zkontrolujte je a přihlášku odešlete.", "The details are pre-filled – check them and send the form."),
  r("exportColumns.button", "Sloupce exportu", "Export columns"),
  r("exportColumns.titleEvent", "Sloupce exportu této akce", "This event's export columns"),
  r("exportColumns.titleOrg", "Výchozí sloupce exportu účastníků", "Default participant export columns"),
  r("exportColumns.resetEvent", "Podle organizace", "As the organization's"),
  r("exportColumns.resetOrg", "Všechna pole", "All fields"),
  r("exportColumns.orgHint", "Export účastníků na Disk – výchozí sloupce a jejich pořadí (akce je může změnit u tlačítka exportu):", "Participant export to Drive – default columns and their order (an event may change them next to its export button):"),
  r("compose.templateFiles", "Ze šablony se přiloží:", "Attached from the template:"),
  r("participantsPage.offerMembership", "Nabídnout členství", "Offer membership"),
  r("participantsPage.offerMembershipHint", "Vybraným, kteří nejsou ve Členech, pošle nabídku členství s předvyplněnou přihláškou (Ještě nejsem členem). Ve Členech se objeví až po jejím odeslání; pak uvidí v portálu i tuto přihlášku.", "Sends the picked ones not in Members the membership offer with a pre-filled registration (Not a member yet). They appear in Members only once they send it; then this registration shows in their portal too."),
  r("participantsPage.offerMembershipNone", "Všichni vybraní už jsou ve Členech.", "All the picked ones are in Members already."),
  r("emailKinds.membershipOffer.name", "Nabídka členství (nečlenové)", "Membership offer (non-members)"),
  r("emailKinds.membershipOffer.what", "Účastníkovi, který není ve Členech: nabídka členství s odkazem na předvyplněnou přihlášku ke členství ({{membership_offer_link}}).", "To a participant not in Members: the membership offer with the link to a pre-filled membership registration ({{membership_offer_link}})."),
  r("emailKinds.membershipOffer.where", "Posílá se ze Seznamu účastníků: vyberte účastníky → Nabídnout členství. Odkaz vede na akci nastavenou u „Ještě nejsem členem“ (Organizace → Vzhled veřejných stránek).", "Sent from the participant list: pick participants → Offer membership. The link leads to the event set for “Not a member yet” (Organization → Public pages)."),
  r("emailKinds.membershipOffer.open", "Otevřít Seznam účastníků", "Open the participant list"),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} portal-pills keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
