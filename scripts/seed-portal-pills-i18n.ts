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
  r("participantsPage.offerMembershipHint", "Vybraným, kteří nejsou v Lidech, pošle nabídku členství s předvyplněnou přihláškou (Ještě nejsem členem). V Lidech se objeví až po jejím odeslání; pak uvidí v portálu i tuto přihlášku.", "Sends the picked ones not in People the membership offer with a pre-filled registration (Not a member yet). They appear in People only once they send it; then this registration shows in their portal too."),
  r("participantsPage.offerMembershipNone", "Všichni vybraní už jsou v Lidech.", "All the picked ones are in People already."),
  r("emailKinds.membershipOffer.name", "Nabídka členství (nečlenové)", "Membership offer (non-members)"),
  r("emailKinds.membershipOffer.what", "Účastníkovi, který není v Lidech: nabídka členství s odkazem na předvyplněnou přihlášku ke členství ({{membership_offer_link}}).", "To a participant not in People: the membership offer with the link to a pre-filled membership registration ({{membership_offer_link}})."),
  r("emailKinds.membershipOffer.where", "Posílá se ze Seznamu účastníků: vyberte účastníky → Nabídnout členství. Odkaz vede na akci nastavenou u „Ještě nejsem členem“ (Organizace → Vzhled veřejných stránek).", "Sent from the participant list: pick participants → Offer membership. The link leads to the event set for “Not a member yet” (Organization → Public pages)."),
  r("emailKinds.membershipOffer.open", "Otevřít Seznam účastníků", "Open the participant list"),
  // 2026-10-27 b: category on the profile, documents done by the details.
  r("fieldOrder.categoryRow", "Cenová kategorie (z přihlášek)", "Price category (from registrations)"),
  r("fieldOrder.categoryShow", "zobrazit v profilu", "show on the profile"),
  r("listTemplateAdmin.fromDetailsLabel", "Splněno vyplněním podrobných údajů", "Done by filling in the detailed information"),
  r("listTemplateAdmin.fromDetailsHint", "Dokument se počítá jako přijatý, jakmile má účastník vyplněná všechna pole, která akce vyžaduje (např. zdravotní dotazník, jehož otázky jsou teď pole). Jde do Dokumenty x/y, {{document_checklist}}, přehledu dokumentů, portálu i exportu; nahrávat se nedá.", "Counts as received once the participant has every field the event requires filled in (e.g. the health questionnaire whose questions are fields now). Goes into Documents x/y, {{document_checklist}}, the documents overview, the portal and the export; no upload."),
  r("detailsDocs.done", "vyplněno v údajích", "filled in the details"),
  r("detailsDocs.hint", "Přijato vyplněním podrobných údajů (nastavení dokumentu)", "Received by filling in the detailed information (document setting)"),
  r("portal.docFromDetails", "Vyplněno v údajích", "Filled in the details"),
  // 2026-10-27 c: bulk answers, composite text with variables, field blocks at the top of the portal card.
  r("bulkAnswers.open", "Hromadná úprava odpovědí", "Bulk edit answers"),
  r("bulkAnswers.title", "Hromadná úprava odpovědí", "Bulk edit answers"),
  r("bulkAnswers.hint", "Vyberte otázku, zaškrtněte odpovědi (např. všechna „ne“ u alergií) a smažte je, nebo nahraďte jiným textem. Velikost písmen a mezery na krajích se nerozlišují.", "Pick a question, tick the answers (e.g. every “no” in allergies) and clear them or replace them with another text. Letter case and spaces around don't matter."),
  r("bulkAnswers.field", "Otázka", "Question"),
  r("bulkAnswers.none", "Na tuto otázku zatím nikdo neodpověděl.", "Nobody has answered this question yet."),
  r("bulkAnswers.clear", "Smazat odpovědi", "Clear the answers"),
  r("bulkAnswers.replace", "Nahradit textem", "Replace with a text"),
  r("bulkAnswers.replacement", "nová odpověď", "new answer"),
  r("bulkAnswers.profiles", "Stejně upravit i v profilu v Lidech (projeví se i v dalších propojených akcích)", "Change the same answer in the Members profile too (reaches their other connected events)"),
  r("bulkAnswers.apply", "Upravit {n} odpovědí", "Edit {n} answers"),
  r("bulkAnswers.confirmClear", "Smazat {n} odpovědí? Nejde to vrátit.", "Clear {n} answers? This can't be undone."),
  r("bulkAnswers.confirmReplace", "Nahradit {n} odpovědí textem „{value}“? Nejde to vrátit.", "Replace {n} answers with “{value}”? This can't be undone."),
  r("bulkAnswers.done", "Upraveno: {participants} přihlášek, {profiles} profilů v Lidech.", "Changed: {participants} registrations, {profiles} Members profiles."),
  r("bulkAnswers.failed", "Úprava se nepovedla.", "The change failed."),
  r("participantFieldAdmin.compositeTemplate", "Text s proměnnými (nepovinné – místo částí výše)", "Text with variables (optional – instead of the parts above)"),
  r("participantFieldAdmin.compositeTemplateHint", "{{klíč}} = hodnota pole (klikněte na pole níže). {{#klíč}}…{{/klíč}} se ukáže, jen když pole něco obsahuje (ne „Ne“), {{^klíč}}…{{/klíč}} jen když ne. Např. členství: {{#clenstvi_rok}}Člen Záře, nižší cena {{price}}{{/clenstvi_rok}}{{^clenstvi_rok}}Nečlen, cena {{price}}{{/clenstvi_rok}}. Funguje v seznamech, dokumentech, e-mailech, exportu i na kartě v portálu.", "{{key}} = the field's value (click a field below). {{#key}}…{{/key}} shows only when the field says something (not “Ne”), {{^key}}…{{/key}} only when it doesn't. E.g. membership: {{#clenstvi_rok}}Member, lower price {{price}}{{/clenstvi_rok}}{{^clenstvi_rok}}Non-member, price {{price}}{{/clenstvi_rok}}. Works in lists, documents, e-mails, the export and the portal card."),
  r("portalCard.top", "Zobrazit nahoře na kartě (bez sbalení)", "Show at the top of the card (not folded)"),
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  for (const row of rows) await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  console.log(`  ok: ${rows.length} portal-pills keys`);
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
