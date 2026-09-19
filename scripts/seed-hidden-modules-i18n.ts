// One-off: personal-settings "which modules show in my menu" translations.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = [
    { key: "settingsPage.modulesLabel", cs: "Moduly v mém menu", en: "Modules in my menu" },
    {
      key: "settingsPage.modulesHint",
      cs: "Skryje modul jen vám. Které moduly máte k dispozici, určuje administrátor.",
      en: "Hides a module for you only. Which modules you have is set by an admin.",
    },
  ];
  for (const row of rows) {
    await prisma.translation.upsert({ where: { key: row.key }, update: { cs: row.cs, en: row.en }, create: row });
    console.log(`  ok: ${row.key}`);
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
