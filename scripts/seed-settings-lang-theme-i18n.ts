// One-off: adds the language/theme selector moved into the personal
// settings page (previously only togglable from the sidebar). Same
// pattern as the other seed-*-i18n.ts scripts -- prisma/seed.ts only
// seeds a fresh install, not this database.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const rows: { key: string; cs: string; en: string }[] = [
    { key: "settingsPage.languageLabel", cs: "Jazyk", en: "Language" },
    { key: "settingsPage.themeLabel", cs: "Motiv", en: "Theme" },
    { key: "settingsPage.themeLight", cs: "Světlý", en: "Light" },
    { key: "settingsPage.themeDark", cs: "Tmavý", en: "Dark" },
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
