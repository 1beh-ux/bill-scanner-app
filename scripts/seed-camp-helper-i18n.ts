// One-off: pushes the new/changed translation keys from this batch (visual
// identity + UX pass + Sheets import) into the live translations table.
// Same pattern as scripts/seed-meds-grid-i18n.ts.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const rows: { key: string; cs: string; en: string }[] = [
    { key: "nav.sectionMail", cs: "Modul Pošta", en: "Mail module" },
    { key: "categoryTemplates.confirmDelete", cs: 'Opravdu smazat kategorii "{name}"?', en: 'Really delete category "{name}"?' },
    { key: "participantImportPage.tabPaste", cs: "Vložit ze schránky", en: "Paste from clipboard" },
    { key: "participantImportPage.tabSheets", cs: "Google Sheets", en: "Google Sheets" },
    {
      key: "participantImportPage.sheetsInstructions",
      cs: "Sdílejte tabulku (jako čtenář) s tímto účtem, pak vložte ID tabulky nebo celý odkaz na ni:",
      en: "Share the sheet (as a viewer) with this account, then paste the sheet's ID or its full link:",
    },
    { key: "participantImportPage.sheetsIdPlaceholder", cs: "ID tabulky nebo odkaz na ni", en: "Sheet ID or link" },
    { key: "participantImportPage.sheetsLoadButton", cs: "Načíst sloupce", en: "Load columns" },
    {
      key: "participantImportPage.sheetsShareError",
      cs: "Tabulku se nepodařilo přečíst. Ověřte, že je sdílená (jako čtenář) s {email}.",
      en: "Couldn't read the sheet. Check that it's shared (as a viewer) with {email}.",
    },
    { key: "participantImportPage.sheetsLoadError", cs: "Načtení se nezdařilo. Zkontrolujte ID tabulky.", en: "Failed to load. Check the sheet ID." },
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
