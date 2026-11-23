// Fields Manager phase 7 fallback: undo one clean-up action (merge / make calculated / delete) by its log id, when the
// screen can't be used. Same code as "Vrátit zpět". Prints counts only.
//   bash scripts/staging/run-staging-db.sh npx tsx scripts/fields/undo.ts <logId>          (staging)
//   (production: only through the read-write helper, after a backup, and only when asked)
async function main() {
  const logId = process.argv[2];
  if (!logId) throw new Error("usage: undo.ts <logId>");
  const { prisma } = await import("../../src/lib/prisma");
  const { undoChange } = await import("../../src/lib/field-merge");
  const log = await prisma.fieldChangeLog.findUniqueOrThrow({ where: { id: logId }, select: { organizationId: true, action: true } });
  console.log(JSON.stringify({ action: log.action, result: await undoChange(log.organizationId, logId) }));
}
main().then(() => process.exit(0)).catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
export {};
