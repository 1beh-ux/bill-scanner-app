// One-off, idempotent: Drive became per-user (Event.driveConfiguredByUserId decides
// whose connected Google account an event uses). Before that, ONE app-wide "latest
// connection wins" account did all the Drive work. So that nothing changes on
// deploy: every event that has Drive folders set and no owner yet gets the user of
// the current latest DriveAccount as its owner.
//
//   npx tsx scripts/backfill-drive-configured-by.ts            # dry run (default)
//   npx tsx scripts/backfill-drive-configured-by.ts --apply
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");

  const latest = await prisma.driveAccount.findFirst({
    orderBy: { connectedAt: "desc" },
    include: { connectedByUser: { select: { id: true, displayName: true, email: true } } },
  });
  if (!latest) {
    console.log("No connected Google account exists -- nothing to backfill (events keep using the service account).");
    return;
  }
  console.log(`Latest connection: ${latest.email} (user ${latest.connectedByUser.displayName} <${latest.connectedByUser.email}>)`);

  const events = await prisma.event.findMany({
    where: {
      driveConfiguredByUserId: null,
      OR: [{ driveIngestFolderId: { not: null } }, { driveExportFolderId: { not: null } }, { driveParticipantsFolderId: { not: null } }],
    },
    select: { id: true, name: true },
  });
  for (const e of events) console.log(`  ${apply ? "set" : "would set"}: "${e.name}" -> ${latest.connectedByUser.displayName}`);
  if (apply && events.length > 0) {
    await prisma.event.updateMany({ where: { id: { in: events.map((e) => e.id) } }, data: { driveConfiguredByUserId: latest.connectedByUserId } });
  }
  console.log(`${apply ? "Updated" : "Would update"} ${events.length} event(s).${apply ? "" : " Re-run with --apply."}`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
