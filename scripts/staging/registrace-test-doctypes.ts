// STAGING ONLY: the two TEST membership events track only their TEST documents (the organization's other document
// types copied in on creation are switched off there). Names only.
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  for (const name of ["TEST Členství 2026", "TEST Registrace 2027"]) {
    const e = await prisma.event.findFirstOrThrow({ where: { name } });
    const keep = name.endsWith("2026") ? ["test_registracni_list"] : ["test_registracni_list", "test_platba"];
    await prisma.eventListItem.updateMany({ where: { eventId: e.id, kind: "document", NOT: { key: { in: keep } } }, data: { active: false } });
    await prisma.eventListItem.updateMany({ where: { eventId: e.id, kind: "document", key: null }, data: { active: false } });
    await prisma.eventListItem.updateMany({ where: { eventId: e.id, kind: "document", key: { in: keep } }, data: { active: true } });
    const on = await prisma.eventListItem.findMany({ where: { eventId: e.id, kind: "document", active: true }, select: { name: true } });
    console.log(`${name}: ${on.map((d) => d.name).join(", ")}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
export {};
