import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const rows: { key: string; cs: string; en: string }[] = [
    {
      key: "nav.translations",
      cs: "Překlady",
      en: "Translations",
    },
    {
      key: "translationsPage.searchPlaceholder",
      cs: "Hledat podle klíče nebo textu...",
      en: "Search by key or text...",
    },
    {
      key: "translationsPage.colKey",
      cs: "Klíč",
      en: "Key",
    },
    {
      key: "translationsPage.colUsedIn",
      cs: "Použito v",
      en: "Used in",
    },
    {
      key: "translationsPage.empty",
      cs: "Žádné překlady neodpovídají hledání.",
      en: "No translations match your search.",
    },
    {
      key: "translationsPage.errorSaveFailed",
      cs: "Uložení se nezdařilo.",
      en: "Failed to save.",
    },
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
