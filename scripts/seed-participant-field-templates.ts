// One-off: seeds the org-level ParticipantFieldTemplate rows for the five
// fields that used to be fixed Participant columns (address, health
// insurance, gender, membership, release-persons), now converted into the
// dynamic custom-fields system. Same pattern as the other seed-*.ts
// scripts -- prisma/seed.ts only seeds a fresh install, not this database.
// Keys match scripts/seed-document-merge-variables.ts's participant_custom_field
// rows 1:1, and the migration's own data backfill uses these same keys when
// folding the old columns into Participant.customFieldValues.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const rows: { key: string; label: string; fieldType: string }[] = [
    { key: "adresa", label: "Adresa trvalého bydliště", fieldType: "text" },
    { key: "pojistovna", label: "Zdravotní pojišťovna", fieldType: "text" },
    { key: "pohlavi", label: "Pohlaví", fieldType: "text" },
    { key: "clenstvi_zare", label: "Je členem organizace", fieldType: "boolean" },
    { key: "vydani_osoby", label: "Dítě může být vydáno těmto osobám", fieldType: "text" },
  ];

  for (const row of rows) {
    await prisma.participantFieldTemplate.upsert({
      where: { key: row.key },
      update: { label: row.label, fieldType: row.fieldType as never },
      create: { ...row, fieldType: row.fieldType as never, defaultSurfaces: [] },
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
