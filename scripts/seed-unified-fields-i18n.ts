// One-off: pushes the new translation keys from the unified
// participant-fields batch (renamed/added surfaces, document-export
// toggle, personal settings page) into the live translations table. Same
// pattern as the other seed-*-i18n.ts scripts -- prisma/seed.ts only
// seeds a fresh install, not this database.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const rows: { key: string; cs: string; en: string }[] = [
    { key: "participantFieldAdmin.surface.health_list", cs: "Sloupec — Zdraví", en: "Column — Health" },
    { key: "participantFieldAdmin.surface.health_detail", cs: "Detail účastníka — Zdraví", en: "Participant detail — Health" },
    { key: "participantFieldAdmin.surface.mail_list", cs: "Sloupec — Pošta", en: "Column — Mail" },
    { key: "participantFieldAdmin.defaultSurfacesLabel", cs: "Výchozí zobrazení při propojení s akcí:", en: "Default visibility when synced into an event:" },
    { key: "participantFieldAdmin.includeInDocumentsLabel", cs: "Zahrnout do dokumentů", en: "Include in documents" },
    { key: "participantFieldAdmin.includeInDocumentsShort", cs: "v dokumentech", en: "in documents" },
    { key: "nav.personalSettings", cs: "Osobní nastavení", en: "Personal settings" },
    { key: "settingsPage.landingPathLabel", cs: "Úvodní stránka po přihlášení", en: "Landing page after login" },
    { key: "settingsPage.landingPathDefault", cs: "Výchozí (Akce)", en: "Default (Events)" },
    { key: "settingsPage.saved", cs: "Uloženo", en: "Saved" },
    { key: "settingsPage.langThemeHint", cs: "Jazyk a motiv se ukládají hned při přepnutí v postranním panelu.", en: "Language and theme save immediately when toggled in the sidebar." },
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
