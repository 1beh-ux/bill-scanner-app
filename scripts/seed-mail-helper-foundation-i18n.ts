import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const rows: { key: string; cs: string; en: string }[] = [
    { key: "accessTab.moduleMail", cs: "Pošta", en: "Mail" },
    { key: "listTemplateAdmin.displayNameLabel", cs: "Zobrazený název", en: "Display name" },
    { key: "listTemplateAdmin.expectedValueLabel", cs: "Očekávaná hodnota (nepovinné)", en: "Expected value (optional)" },
    { key: "listTemplateAdmin.filenameSuffixLabel", cs: "Přípona názvu souboru", en: "Filename suffix" },
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
