// One-off, safe to re-run: renames the "Léky" field (customFieldValues.medsNotes,
// the free-text health note from the registration form) to "Léky uvedené v přihlášce"
// (Part 3 of the participants/settings prompt) -- the old label read like the real
// medication plan, which is a different, structured thing (see medPlansSection).
// Only touches rows whose label is still the old default; anyone who already
// customized it keeps their own wording.
//
//   npx tsx scripts/rename-medsnotes-label.ts            # dry run
//   npx tsx scripts/rename-medsnotes-label.ts --apply
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

const OLD_LABEL = "Léky";
const NEW_LABEL = "Léky uvedené v přihlášce";

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");

  // One per organization since organizations step 4.
  const templates = await prisma.participantFieldTemplate.findMany({ where: { key: "medsNotes", label: OLD_LABEL } });
  for (const template of templates) {
    console.log(`  ${apply ? "update" : "would update"}: template (${template.organizationId ?? "app"})`);
    if (apply) await prisma.participantFieldTemplate.update({ where: { id: template.id }, data: { label: NEW_LABEL } });
  }

  const eventFields = await prisma.eventParticipantField.findMany({
    where: { key: "medsNotes", label: OLD_LABEL },
    select: { id: true, event: { select: { name: true } } },
  });
  for (const f of eventFields) {
    console.log(`  ${apply ? "update" : "would update"}: ${f.event.name}`);
    if (apply) await prisma.eventParticipantField.update({ where: { id: f.id }, data: { label: NEW_LABEL } });
  }

  console.log(`${apply ? "Updated" : "Would update"}: ${templates.length + eventFields.length} row(s).${apply ? "" : " Re-run with --apply."}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
