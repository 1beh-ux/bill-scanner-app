import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const rows: { key: string; cs: string; en: string }[] = [
    {
      key: "billsPage.searchPlaceholder",
      cs: "Hledat podle jména, dodavatele, kategorie...",
      en: "Search by name, merchant, category...",
    },
    {
      key: "billsPage.searchClear",
      cs: "Vymazat hledání",
      en: "Clear search",
    },
    {
      key: "billsPage.searchResultCount",
      cs: "Nalezeno: {count}",
      en: "{count} matching",
    },
    {
      key: "billsPage.searchNoMatches",
      cs: "Žádné doklady neodpovídají hledání.",
      en: "No bills match your search.",
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
