// After copy-from-prod (STAGING ONLY): Fields Manager on for the given organization; prints names of organizations
// (not personal data) and counts.
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true, features: true, _count: { select: { events: true, children: true } } } });
  for (const o of orgs) console.log(`${o.id.slice(0, 8)} | ${o.name} | events ${o._count.events} | people ${o._count.children} | features ${JSON.stringify(o.features)}`);
  const target = orgs.find((o) => o.id.startsWith(process.argv[2] ?? "-"));
  if (target) {
    const f = Array.isArray(target.features) ? (target.features as string[]) : [];
    if (!f.includes("fields_manager")) await prisma.organization.update({ where: { id: target.id }, data: { features: [...f, "fields_manager"] } });
    console.log(`fields_manager ON for ${target.name}`);
  }
  console.log("staging marker:", !!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } })), "| users:", await prisma.user.count());
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
export {};
