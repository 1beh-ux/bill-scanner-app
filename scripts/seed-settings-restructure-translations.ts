import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const rows: { key: string; cs: string; en: string }[] = [
    { key: "categoryTemplates.errorEditFailed", cs: "Nepodařilo se upravit kategorii.", en: "Failed to update category." },
    { key: "categoryTemplates.descriptionPlaceholder", cs: "Popis (nepovinné)", en: "Description (optional)" },
    { key: "eventDetail.syncFromTemplates", cs: "Synchronizovat se šablonami", en: "Sync from templates" },
    { key: "eventDetail.errorSyncFailed", cs: "Synchronizace se nezdařila.", en: "Sync failed." },
    { key: "eventSettings.tabSettings", cs: "Kategorie", en: "Categories" },
    { key: "eventSettings.tabDrive", cs: "Google Drive", en: "Google Drive" },
    { key: "eventSettings.tabModules", cs: "Moduly", en: "Modules" },
    { key: "nav.templates", cs: "Šablony", en: "Templates" },
    { key: "templatesPage.tabHealth", cs: "Zdraví", en: "Health" },
    { key: "templatesPage.tabBills", cs: "Účtenky", en: "Bills" },
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
