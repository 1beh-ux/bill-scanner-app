// One-off: pushes the new translation keys from the dynamic
// participant-custom-fields batch (org/event field admin, tab labels,
// field-type + surface labels) into the live translations table. Same
// pattern as the other seed-*-i18n.ts scripts -- prisma/seed.ts only
// seeds a fresh install, not this database.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const rows: { key: string; cs: string; en: string }[] = [
    { key: "eventSettings.tabParticipants", cs: "Účastníci", en: "Participants" },
    { key: "templatesPage.tabParticipants", cs: "Účastníci", en: "Participants" },
    { key: "participantFieldAdmin.keyLabel", cs: "Klíč (např. adresa)", en: "Key (e.g. address)" },
    { key: "participantFieldAdmin.optionsLabel", cs: "Možnosti, oddělené čárkou", en: "Options, comma-separated" },
    { key: "participantFieldAdmin.surfacesLabel", cs: "Zobrazit ve sloupcích:", en: "Show as a column in:" },
    { key: "participantFieldAdmin.errorInvalidKey", cs: "Klíč smí obsahovat jen písmena, číslice a podtržítko a musí začínat písmenem.", en: "Key may only contain letters, digits, and underscore, and must start with a letter." },
    { key: "participantFieldAdmin.type.text", cs: "Text", en: "Text" },
    { key: "participantFieldAdmin.type.number", cs: "Číslo", en: "Number" },
    { key: "participantFieldAdmin.type.date", cs: "Datum", en: "Date" },
    { key: "participantFieldAdmin.type.boolean", cs: "Ano/Ne", en: "Yes/No" },
    { key: "participantFieldAdmin.type.select", cs: "Výběr z možností", en: "Select from options" },
    { key: "participantFieldAdmin.surface.list", cs: "Seznam účastníků", en: "Participant list" },
    { key: "participantFieldAdmin.surface.health", cs: "Zdraví", en: "Health" },
    { key: "participantFieldAdmin.surface.mail", cs: "Pošta", en: "Mail" },
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
