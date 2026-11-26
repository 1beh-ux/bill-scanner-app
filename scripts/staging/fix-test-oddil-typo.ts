// STAGING, test data only: the 2026-11-24 test CSV had "…mimo oddíly)" (stray bracket) -- not an option of Oddíl, so
// the portal refused those people's registration. Fixes the value on the people and their registrations. Counts only.
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  const BAD = "Ostatní členové skupiny mimo oddíly)", GOOD = "Ostatní členové skupiny mimo oddíly";
  let people = 0, registrations = 0;
  for (const c of await prisma.child.findMany({ select: { id: true, fieldValues: true } })) {
    const v = (c.fieldValues as Record<string, string> | null) ?? {};
    if (v.oddil !== BAD) continue;
    await prisma.child.update({ where: { id: c.id }, data: { fieldValues: { ...v, oddil: GOOD } } });
    people++;
  }
  for (const p of await prisma.participant.findMany({ select: { id: true, customFieldValues: true } })) {
    const v = (p.customFieldValues as Record<string, string> | null) ?? {};
    if (v.oddil !== BAD) continue;
    await prisma.participant.update({ where: { id: p.id }, data: { customFieldValues: { ...v, oddil: GOOD } } });
    registrations++;
  }
  console.log(JSON.stringify({ people, registrations }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exit(1); });
export {};
