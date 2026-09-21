// One-off, idempotent: the `accountant` role used to carry an implicit
// "bills on every event" shortcut in hasModuleAccess(). That shortcut is gone
// (accountant is only a label now), so before deploying the code change give
// every accountant explicit `bills` grants on ALL existing events, so nobody
// loses access.
//
//   npx tsx scripts/grant-accountants-bills-access.ts            # dry run (default)
//   npx tsx scripts/grant-accountants-bills-access.ts --apply    # write
//
// Also creates a missing EventModule(bills) row as enabled; an existing row
// (enabled or not) is never touched.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");

  const accountants = await prisma.user.findMany({ where: { role: "accountant" }, select: { id: true, email: true, active: true } });
  const events = await prisma.event.findMany({ select: { id: true, name: true } });
  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${accountants.length} accountant(s), ${events.length} event(s)`);

  let grantsToCreate = 0;
  let modulesToCreate = 0;

  for (const ev of events) {
    const mod = await prisma.eventModule.findUnique({ where: { eventId_moduleKey: { eventId: ev.id, moduleKey: "bills" } } });
    if (!mod) {
      modulesToCreate++;
      console.log(`  event "${ev.name}": would create EventModule(bills, enabled)`);
      if (apply) await prisma.eventModule.create({ data: { eventId: ev.id, moduleKey: "bills", enabled: true } });
    }
    for (const u of accountants) {
      const grant = await prisma.userEventModuleAccess.findUnique({
        where: { userId_eventId_moduleKey: { userId: u.id, eventId: ev.id, moduleKey: "bills" } },
      });
      if (grant) continue;
      grantsToCreate++;
      console.log(`  ${u.email}${u.active ? "" : " (inactive)"} -> bills on "${ev.name}"`);
      if (apply) await prisma.userEventModuleAccess.create({ data: { userId: u.id, eventId: ev.id, moduleKey: "bills" } });
    }
  }
  console.log(`${apply ? "Created" : "Would create"}: ${grantsToCreate} grant(s), ${modulesToCreate} EventModule row(s).`);
  if (!apply) console.log("Re-run with --apply to write.");
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
