// Owner's request 2026-11-26: a select field with separate options for children and adults (e.g. Pohlaví: Dívka /
// Chlapec vs Žena / Muž) got the other group's value (an import with Muž / Žena for everyone). For the given field:
// a child's adult value -> the children's option at the same position, an adult's children's value -> the adult one;
// on the person and on all their registrations. Other values stay. DRY RUN by default; counts only.
//   ~/claude-helpers/run-db.sh npx tsx scripts/fix-age-options.ts "<organization>" <fieldKey> [--apply]
async function main() {
  const [orgName, key] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const apply = process.argv.includes("--apply");
  if (!orgName || !key) throw new Error('usage: "<organization>" <fieldKey> [--apply]');
  const { prisma } = await import("../src/lib/prisma");
  const { ageOptionSwap } = await import("../src/lib/registration-fields");
  const staging = !!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }));
  const org = await prisma.organization.findFirstOrThrow({ where: { name: orgName } });
  const t = await prisma.participantFieldTemplate.findFirstOrThrow({ where: { organizationId: org.id, key }, select: { options: true, adultOptions: true } });
  const people = await prisma.child.findMany({ where: { organizationId: org.id }, select: { id: true, isAdult: true, fieldValues: true, participants: { select: { id: true, customFieldValues: true } } } });
  const counts = { people: 0, registrations: 0 };
  for (const c of people) {
    const fix = (v: unknown) => (typeof v === "string" ? ageOptionSwap(t, v, c.isAdult) : null);
    const pv = (c.fieldValues as Record<string, string> | null) ?? {};
    const np = fix(pv[key]);
    if (np) {
      counts.people++;
      if (apply) await prisma.child.update({ where: { id: c.id }, data: { fieldValues: { ...pv, [key]: np } } });
    }
    for (const p of c.participants) {
      const rv = (p.customFieldValues as Record<string, string> | null) ?? {};
      const nr = fix(rv[key]);
      if (!nr) continue;
      counts.registrations++;
      if (apply) await prisma.participant.update({ where: { id: p.id }, data: { customFieldValues: { ...rv, [key]: nr } } });
    }
  }
  console.log(JSON.stringify({ database: staging ? "STAGING" : "PRODUCTION", mode: apply ? "APPLY" : "dry run (nothing written)", field: key, ...counts }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
export {};
