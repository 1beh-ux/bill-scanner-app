// Participant e-mail page (compose), participant detail page, real-data
// template previews, fixed attachments, questionnaire document from a sheet.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    { key: "compose.backToList", cs: "Zpět na seznam účastníků", en: "Back to participants" },
    { key: "compose.noneSelected", cs: "Nejsou vybraní žádní účastníci — vyberte je v seznamu účastníků.", en: "No participants selected — pick them in the participant list." },
    { key: "compose.templateEvent", cs: "Text je ze šablony této akce.", en: "Text comes from this event's template." },
    { key: "compose.templateOrg", cs: "Text je z výchozí šablony organizace (akce nemá vlastní).", en: "Text comes from the organisation default (the event has none of its own)." },
    { key: "compose.editTemplate", cs: "Upravit šablonu", en: "Edit template" },
    { key: "compose.view.filled", cs: "Náhled s údaji", en: "Filled in" },
    { key: "compose.view.template", cs: "Šablona s proměnnými", en: "Template with variables" },
    { key: "compose.to", cs: "Komu", en: "To" },
    { key: "compose.previewHint", cs: "Přesně takto e-mail odejde tomuto účastníkovi (vyplněno stejným kódem jako při odeslání). Nic se neodesílá.", en: "Exactly what this participant gets (filled in by the same code as the send). Nothing is sent." },
    { key: "participantDetail.notFound", cs: "Účastník nebyl nalezen.", en: "Participant not found." },
    { key: "participantDetail.documentsVia.sheet", cs: "z tabulky", en: "from a sheet" },
    { key: "participantDetail.documentsVia.generated", cs: "vytvořeno", en: "generated" },
    { key: "emailTemplateAdmin.previewSampleNoParticipants", cs: "Akce zatím nemá účastníky — náhled je s ukázkovými hodnotami.", en: "The event has no participants yet — the preview uses sample values." },
    { key: "listTemplateAdmin.staticAttachmentLabel", cs: "Stejná příloha pro všechny (např. Pokyny)", en: "Same attachment for everyone (e.g. instructions)" },
    { key: "listTemplateAdmin.staticAttachmentHint", cs: "Šablona se jen převede do PDF a přiloží — bez proměnných, bez ukládání ke každému účastníkovi a bez sledování, zda byla doručena.", en: "The template is just exported to PDF and attached — no variables, no copy per participant, not tracked as received." },
    { key: "participantSync.markDocument", cs: "Označit dokument jako doručený", en: "Mark document as received" },
    { key: "participantSync.markDocumentNone", cs: "— nic —", en: "— none —" },
    { key: "participantSync.markDocumentHint", cs: "Každý nalezený nebo nově vytvořený účastník s řádkem v této tabulce dostane dokument jako doručený (např. Dotazník z tabulky odpovědí dotazníku).", en: "Every matched or newly created participant with a row in this sheet gets the document ticked as received (e.g. Questionnaire from the form's responses sheet)." },
    { key: "participantSync.count.documentsMarked", cs: "označeno dokumentů {count}", en: "{count} documents ticked" },
    { key: "statusUpdate.button", cs: "Update stavu dokumentů", en: "Document status update" },
    { key: "statusUpdate.title", cs: "Update stavu dokumentů", en: "Document status update" },
    { key: "statusUpdate.intro", cs: "Vybraným rodičům odejde přehled, které dokumenty už máme a které chybí. Kliknutím na řádek zobrazíte náhled pro daného účastníka.", en: "Selected parents get an overview of which documents we have and which are missing. Click a row to preview it for that participant." },
    { key: "statusUpdate.previewHint", cs: "Přesně takto e-mail odejde tomuto účastníkovi. Nic se neodesílá.", en: "Exactly what this participant gets. Nothing is sent." },
    { key: "common.back", cs: "Zpět", en: "Back" },
    { key: "participantsPage.writeEmailButton", cs: "Napsat e-mail", en: "Write an e-mail" },
    { key: "participantsPage.writeEmailHint", cs: "Vybraným účastníkům, nebo všem zobrazeným, když nikdo vybraný není.", en: "To the selected participants, or everyone shown when nobody is selected." },
    { key: "participantFieldAdmin.surfacesLabel", cs: "Kde se zobrazuje", en: "Where it shows" },
    { key: "participantFieldAdmin.surface.mailList", cs: "Přehled dokumentů", en: "Documents overview" },
    { key: "participantFieldAdmin.surface.documents", cs: "Dokumenty", en: "Documents" },
    { key: "participantFieldAdmin.surface.email", cs: "E-maily", en: "E-mails" },
    { key: "participantDetail.prev", cs: "Předchozí účastník", en: "Previous participant" },
    { key: "participantDetail.next", cs: "Další účastník", en: "Next participant" },
    { key: "participantDetail.saveAndNext", cs: "Uložit a další", en: "Save and next" },
    { key: "participantDetail.saveAndClose", cs: "Uložit a zavřít", en: "Save and close" },
    { key: "eventDetail.categoryDescriptionPlaceholder", cs: "Popis (pro tuto akci)", en: "Description (for this event)" },
    { key: "participantFieldAdmin.surface.health", cs: "Zdraví", en: "Health" },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
  }
  console.log(`  ok: ${rows.length} compose/detail keys`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
