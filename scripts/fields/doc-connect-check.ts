// STAGING check of "connect unresolved document variables": analyzes the TEST registration form, adds an alias for
// one old variable, re-analyzes (it must turn into an old name pointing at the field), then removes the alias.
//   DRIVE_SERVICE_ACCOUNT_EMAIL=… bash scripts/staging/run-staging-db.sh npx tsx scripts/fields/doc-connect-check.ts
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  const { analyzeTemplate, addAlias } = await import("../../src/lib/doc-editor");
  const event = await prisma.event.findFirstOrThrow({ where: { name: "TEST Členství 2026" } });
  const dt = await prisma.eventListItem.findFirstOrThrow({ where: { eventId: event.id, key: "test_registracni_formular" } });
  const user = await prisma.user.findFirstOrThrow({ select: { id: true } });
  const count = (a: NonNullable<Awaited<ReturnType<typeof analyzeTemplate>>>, s: string) => new Set(a.placeholders.filter((p) => p.status === s).map((p) => p.key)).size;
  const before = (await analyzeTemplate(event.id, event.organizationId, dt.id))!;
  const added = await addAlias(event.id, event.organizationId, user.id, "Mem_Name", "Name");
  const again = await addAlias(event.id, event.organizationId, user.id, "Mem_Name", "Name");
  const bad = await addAlias(event.id, event.organizationId, user.id, "Mem_BDate", "nonexistent_key");
  const after = (await analyzeTemplate(event.id, event.organizationId, dt.id))!;
  const mem = after.placeholders.find((p) => p.key === "Mem_Name");
  await prisma.fieldAlias.deleteMany({ where: { organizationId: event.organizationId, alias: "Mem_Name", reason: "document" } });
  const ok = "id" in added && "error" in again && "error" in bad && mem?.status === "alias" && mem.canonical === "Name" && count(after, "unresolved") === count(before, "unresolved") - 1;
  console.log(JSON.stringify({ unresolvedBefore: count(before, "unresolved"), unresolvedAfter: count(after, "unresolved"), targets: before.targets.length, secondAliasRefused: "error" in again, badTargetRefused: "error" in bad, memName: mem?.status, ok }));
  if (!ok) process.exit(1);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exit(1); });
export {};
