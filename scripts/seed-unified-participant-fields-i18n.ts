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
    { key: "participantFieldAdmin.surface.documents", cs: "Dokumenty a hromadná pošta", en: "Documents & mail merge" },
    { key: "participantFieldAdmin.surface.import", cs: "Import účastníků", en: "Import mapping" },
    { key: "participantFieldAdmin.type.image", cs: "Obrázek", en: "Image" },
    { key: "common.none", cs: "Žádné", en: "None" },
    { key: "participantsPage.columnsButton", cs: "Sloupce", en: "Columns" },
    { key: "participantsPage.columnsPickerTitle", cs: "Zobrazené sloupce", en: "Visible columns" },
    { key: "participantsPage.columnsAddPlaceholder", cs: "+ Přidat sloupec…", en: "+ Add column…" },
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
