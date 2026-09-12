// One-off: pushes the new translation keys from the registration-document
// merge batch (auto-attach settings, variable-registry admin page, camp-fee
// settings, new participant fields) into the live translations table. Same
// pattern as the other seed-*-i18n.ts scripts -- prisma/seed.ts only seeds
// a fresh install, not this database.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const rows: { key: string; cs: string; en: string }[] = [
    { key: "listTemplateAdmin.templateGoogleDocIdLabel", cs: "Šablona (Google Doc ID nebo odkaz)", en: "Template (Google Doc ID or link)" },
    { key: "listTemplateAdmin.autoAttachOnAcceptLabel", cs: "Automaticky přiložit při přijetí", en: "Auto-attach on acceptance" },
    { key: "composeEmailModal.autoAttachDocumentsLabel", cs: "Dokumenty k odeslání", en: "Documents to send" },
    { key: "nav.documentVariables", cs: "Proměnné dokumentů", en: "Document variables" },
    { key: "documentVariablesPage.intro", cs: "Mapování {{proměnných}} použitých v šablonách dokumentů (přihláška, posudek) na údaje účastníka, zákonného zástupce nebo akce.", en: "Mapping of {{variables}} used in document templates (application form, health certificate) to participant, guardian, or event data." },
    { key: "documentVariablesPage.keyLabel", cs: "Proměnná", en: "Variable" },
    { key: "documentVariablesPage.sourceFieldLabel", cs: "Zdrojové pole", en: "Source field" },
    { key: "documentVariablesPage.labelLabel", cs: "Popis", en: "Description" },
    { key: "documentVariablesPage.sourceType.participant_field", cs: "Účastník", en: "Participant" },
    { key: "documentVariablesPage.sourceType.guardian_field", cs: "Zákonný zástupce", en: "Guardian" },
    { key: "documentVariablesPage.sourceType.event_field", cs: "Akce", en: "Event" },
    { key: "documentVariablesPage.sourceType.computed", cs: "Vypočítané", en: "Computed" },
    { key: "documentVariablesPage.empty", cs: "Zatím žádné proměnné.", en: "No variables yet." },
    { key: "documentVariablesPage.errorSaveFailed", cs: "Uložení se nezdařilo.", en: "Failed to save." },
    { key: "documentVariablesPage.errorDeleteFailed", cs: "Smazání se nezdařilo.", en: "Failed to delete." },
    { key: "documentVariablesPage.confirmDelete", cs: "Opravdu smazat proměnnou {key}?", en: "Really delete variable {key}?" },
    { key: "feeSettings.title", cs: "Poplatek za tábor", en: "Camp fee" },
    { key: "feeSettings.memberPriceLabel", cs: "Cena pro členy (Kč)", en: "Member price (CZK)" },
    { key: "feeSettings.nonMemberPriceLabel", cs: "Cena pro nečleny (Kč)", en: "Non-member price (CZK)" },
    { key: "feeSettings.bankAccountLabel", cs: "Číslo účtu", en: "Bank account number" },
    { key: "feeSettings.bankCodeLabel", cs: "Kód banky", en: "Bank code" },
    { key: "feeSettings.errorSaveFailed", cs: "Uložení se nezdařilo.", en: "Failed to save." },
    { key: "participantDetail.addressLabel", cs: "Adresa trvalého bydliště", en: "Home address" },
    { key: "participantDetail.healthInsuranceLabel", cs: "Zdravotní pojišťovna", en: "Health insurance" },
    { key: "participantDetail.genderLabel", cs: "Pohlaví", en: "Gender" },
    { key: "participantDetail.releasePersonsLabel", cs: "Dítě může být vydáno těmto osobám", en: "Child may be released to" },
    { key: "participantDetail.isMemberLabel", cs: "Je členem organizace", en: "Is an organization member" },
  ];

  for (const row of rows) {
    await prisma.translation.upsert({
      where: { key: row.key },
      update: { cs: row.cs, en: row.en },
      create: row,
    });
    console.log(`  ok: ${row.key}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
