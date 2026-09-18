// One-off: translation keys for the unified Participant Fields redesign --
// kind badges, the computed-field configure panel (price/variable symbol),
// the new documents/import surfaces, and the roster's column picker. Same
// pattern as the other seed-*-i18n.ts scripts -- prisma/seed.ts only seeds
// a fresh install, not this database.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const rows: { key: string; cs: string; en: string }[] = [
    { key: "participantFieldAdmin.kind.custom", cs: "vlastní", en: "custom" },
    { key: "participantFieldAdmin.kind.builtin", cs: "vestavěné", en: "built-in" },
    { key: "participantFieldAdmin.kind.guardian", cs: "zákonný zástupce", en: "guardian" },
    { key: "participantFieldAdmin.kind.computed", cs: "vypočítané", en: "computed" },
    { key: "participantFieldAdmin.configure", cs: "Nastavit", en: "Configure" },
    {
      key: "participantFieldAdmin.campNameHint",
      cs: "Výjimka: Název akce se spravuje v nastavení akce, není to pole účastníka.",
      en: "Exception: Camp name is managed in event settings -- it isn't a participant field.",
    },
    { key: "participantFieldAdmin.computedSection", cs: "Vypočítané", en: "Computed" },
    {
      key: "participantFieldAdmin.priceConfigHint",
      cs: "Nastaveno v sekci Pošta → Poplatky (cena podle členství, bankovní účet).",
      en: "Configured in the Mail tab → Fees (member/non-member price, bank account).",
    },
    { key: "participantFieldAdmin.vsConfigTitle", cs: "Formule variabilního symbolu", en: "Variable symbol formula" },
    { key: "participantFieldAdmin.vsEventTypeLabel", cs: "Typ akce (1 číslice)", en: "Event type (1 digit)" },
    { key: "participantFieldAdmin.vsOrderInYearLabel", cs: "Pořadí v roce (1 číslice)", en: "Order in year (1 digit)" },
    {
      key: "participantFieldAdmin.vsMembershipFieldLabel",
      cs: "Pole členství (0 = nečlen, 1 = člen)",
      en: "Membership field (0 = non-member, 1 = member)",
    },
    { key: "participantFieldAdmin.vsSaveButton", cs: "Uložit formuli", en: "Save formula" },
    { key: "participantFieldAdmin.vsPreviewYear", cs: "Rok", en: "Year" },
    { key: "participantFieldAdmin.vsPreviewType", cs: "Typ akce", en: "Event type" },
    { key: "participantFieldAdmin.vsPreviewOrder", cs: "Pořadí v roce", en: "Order in year" },
    { key: "participantFieldAdmin.vsPreviewMembership", cs: "Členství", en: "Membership" },
    { key: "participantFieldAdmin.vsPreviewSequence", cs: "Pořadí účastníka", en: "Participant sequence" },
    { key: "participantFieldAdmin.vsPreviewNonMember", cs: "Nečlen", en: "Non-member" },
    { key: "participantFieldAdmin.vsPreviewMember", cs: "Člen", en: "Member" },
    {
      key: "participantFieldAdmin.qrConfigHint",
      cs: "Odvozeno z ceny a bankovního účtu -- není potřeba žádné další nastavení.",
      en: "Derived from price and the bank account -- nothing else to configure.",
    },
    {
      key: "participantFieldAdmin.surface.documents",
      cs: "Dokumenty a e-maily",
      en: "Documents & emails",
    },
    { key: "participantFieldAdmin.surface.import", cs: "Import účastníků", en: "Import mapping" },
    { key: "participantFieldAdmin.colField", cs: "Pole", en: "Field" },
    { key: "participantFieldAdmin.colKind", cs: "Kategorie", en: "Kind" },
    { key: "participantFieldAdmin.colType", cs: "Typ", en: "Type" },
    {
      key: "participantFieldAdmin.confirmRename",
      cs: 'Přejmenovat "{oldKey}" na "{newKey}"? Hodnoty účastníků se přenesou automaticky, ale žádná šablona dokumentu nebo e-mailu, která už používá {oldKey}, se sama nepřepíše -- budete ji muset upravit ručně.',
      en: 'Rename "{oldKey}" to "{newKey}"? Participant values move over automatically, but any document or email template already using {oldKey} won\'t rewrite itself -- you\'ll need to update it by hand.',
    },
    {
      key: "participantFieldAdmin.renameWarning",
      cs: "Změna klíče: existující hodnoty účastníků se přenesou, ale šablony používající starý klíč je třeba upravit ručně.",
      en: "Key change: existing participant values move over, but templates using the old key need manual updating.",
    },
    { key: "participantFieldAdmin.errorKeyTaken", cs: "Tento klíč už používá jiné pole.", en: "That key is already used by another field." },
    { key: "participantFieldAdmin.type.image", cs: "Obrázek", en: "Image" },
    { key: "common.none", cs: "Žádné", en: "None" },
    { key: "participantsPage.columnsButton", cs: "Sloupce", en: "Columns" },
    { key: "participantsPage.columnsPickerTitle", cs: "Zobrazené sloupce", en: "Visible columns" },
    { key: "participantsPage.columnsAddPlaceholder", cs: "+ Přidat sloupec…", en: "+ Add column…" },
    { key: "participantsPage.columnsDragHint", cs: "Táhněte pro přeřazení.", en: "Drag to reorder." },
    { key: "participantsPage.columnsNotShown", cs: "Nezobrazeno", en: "Not shown" },
    { key: "settingsPage.emailSignatureLabel", cs: "Podpis v e-mailech", en: "Email signature" },
    { key: "settingsPage.emailSignaturePlaceholder", cs: "Např. Pavel, hlavní vedoucí", en: "e.g. Pavel, head leader" },
    {
      key: "settingsPage.emailSignatureHint",
      cs: "Nahrazuje {sender_name} v odesílaných e-mailech. Prázdné = použije se vaše jméno v účtu.",
      en: "Overrides {sender_name} in outgoing emails. Empty = uses your account display name.",
    },
    { key: "mailTab.questionnaireTitle", cs: "Dotazník", en: "Questionnaire" },
    {
      key: "mailTab.questionnaireHint",
      cs: "Odkaz je dostupný jako {questionnaire_url} v e-mailech i dokumentech. Vyplnění dotazníku značte ručně jako typ dokumentu (Šablony → Pošta) -- napojení na Google Sheet přidáme později.",
      en: "The link is available as {questionnaire_url} in both emails and documents. Track completion manually as a document type (Templates → Mail) -- a Google Sheet connection comes later.",
    },
    { key: "mailTab.questionnaireUrlLabel", cs: "Odkaz na dotazník", en: "Questionnaire link" },
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
