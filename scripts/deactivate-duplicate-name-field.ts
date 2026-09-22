// One-off, safe to re-run: deactivates the leftover CUSTOM field literally
// labelled "Jméno a příjmení dítěte" (Part 1 of the participants/settings
// prompt) -- it duplicates the builtin "Name" field (same label) and, being
// unused, always shows as an empty "—" column on Health/Mail lists. Only
// touches kind="custom" rows with that exact label; the real builtin "Name"
// field (kind="builtin") is never matched. Deactivates, never deletes --
// any value someone did type into it stays in customFieldValues.
//
//   npx tsx scripts/deactivate-duplicate-name-field.ts            # dry run
//   npx tsx scripts/deactivate-duplicate-name-field.ts --apply
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

const LABEL = "Jméno a příjmení dítěte";

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");

  const eventRows = await prisma.eventParticipantField.findMany({
    where: { label: LABEL, kind: "custom", active: true },
    select: { id: true, key: true, event: { select: { name: true } } },
  });
  for (const row of eventRows) {
    console.log(`  ${apply ? "deactivate" : "would deactivate"}: event field "${row.key}" on ${row.event.name}`);
    if (apply) await prisma.eventParticipantField.update({ where: { id: row.id }, data: { active: false } });
  }

  const templates = await prisma.participantFieldTemplate.findMany({ where: { label: LABEL, active: true } });
  for (const t of templates) {
    console.log(`  ${apply ? "deactivate" : "would deactivate"}: org template "${t.key}"`);
    if (apply) await prisma.participantFieldTemplate.update({ where: { key: t.key }, data: { active: false } });
  }

  console.log(`${apply ? "Deactivated" : "Would deactivate"}: ${eventRows.length} event field(s), ${templates.length} template(s).${apply ? "" : " Re-run with --apply."}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
