// One-off, safe to re-run: updates existing per-event "Email" fields (Part 1
// of the participants/settings prompt) from kind="guardian" (plain
// guardians[0].email) to kind="computed"/computedType="contact_email" (first
// guardian flagged receivesCommunications, else the first) and adds the
// "list" surface so it shows on the central roster, without touching any
// other surface an admin may have added. The key stays "Email" -- existing
// document templates keyed on {{Email}} are unaffected, they just resolve a
// better-chosen address. Only touches rows that still have the old kind.
//
//   npx tsx scripts/backfill-contact-email-field.ts            # dry run
//   npx tsx scripts/backfill-contact-email-field.ts --apply
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");

  const rows = await prisma.eventParticipantField.findMany({
    where: { key: "Email", kind: "guardian" },
    select: { id: true, eventId: true, surfaces: true, event: { select: { name: true } } },
  });

  for (const row of rows) {
    const surfaces = row.surfaces.includes("list") ? row.surfaces : [...row.surfaces, "list" as const];
    console.log(`  ${apply ? "update" : "would update"}: ${row.event.name} -- surfaces ${row.surfaces.join(",")} -> ${surfaces.join(",")}`);
    if (apply) {
      await prisma.eventParticipantField.update({
        where: { id: row.id },
        data: { kind: "computed", computedType: "contact_email", surfaces },
      });
    }
  }
  console.log(`${apply ? "Updated" : "Would update"}: ${rows.length} row(s).${apply ? "" : " Re-run with --apply."}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
