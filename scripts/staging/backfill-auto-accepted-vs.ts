// STAGING: registrations accepted automatically before the fix (auto-accept.ts) have no variable symbol -> no QR.
// Assigns it to accepted participants of the given event that have none. Prints counts only.
//   bash scripts/staging/run-staging-db.sh npx tsx scripts/staging/backfill-auto-accepted-vs.ts "<event name>"
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  const { freezeAcceptedPayment } = await import("../../src/lib/auto-accept");
  const event = await prisma.event.findFirstOrThrow({ where: { name: process.argv[2] } });
  const ids = (await prisma.participant.findMany({ where: { eventId: event.id, registrationStatus: "accepted", registrationNumber: null }, select: { id: true } })).map((p) => p.id);
  await freezeAcceptedPayment(event.id, ids);
  console.log(JSON.stringify({ assigned: ids.length, withVs: await prisma.participant.count({ where: { eventId: event.id, acceptedVariableSymbol: { not: null } } }) }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exit(1); });
export {};
