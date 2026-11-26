// Owner's request 2026-11-26: adults imported with their e-mail in a field (e.g. "email_ucastnika") but without their
// own contact row -- the e-mail the app uses for an adult (portal link, mail, {{Email}}). For every adult of the
// event: their own contact (name = the person, that e-mail, receives mail) on the person when they have none, and on
// the event's registration when it has none. The field stays as it is; nobody's existing contact is changed.
// DRY RUN by default; counts only.
//   ~/claude-helpers/run-db.sh npx tsx scripts/adult-own-contact-from-field.ts "<organization>" "<event>" <fieldKey> [--apply]
async function main() {
  const [orgName, eventName, fieldKey] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const apply = process.argv.includes("--apply");
  if (!orgName || !eventName || !fieldKey) throw new Error('usage: "<organization>" "<event>" <fieldKey> [--apply]');
  const { prisma } = await import("../src/lib/prisma");
  const staging = !!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }));
  const isMail = (v: unknown): v is string => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const org = await prisma.organization.findFirstOrThrow({ where: { name: orgName } });
  const event = await prisma.event.findFirstOrThrow({ where: { organizationId: org.id, name: eventName } });
  const ps = await prisma.participant.findMany({
    where: { eventId: event.id },
    select: { id: true, name: true, isAdult: true, customFieldValues: true, _count: { select: { guardians: true } }, child: { select: { id: true, name: true, isAdult: true, fieldValues: true, _count: { select: { guardians: true } } } } },
  });
  const counts = { adults: 0, noMail: 0, personRowsAdded: 0, registrationRowsAdded: 0, personAlreadyHad: 0, registrationAlreadyHad: 0 };
  for (const p of ps) {
    if (!(p.child?.isAdult ?? p.isAdult)) continue;
    counts.adults++;
    const raw = (p.customFieldValues as Record<string, unknown> | null)?.[fieldKey] ?? (p.child?.fieldValues as Record<string, unknown> | null)?.[fieldKey];
    if (!isMail(raw)) {
      counts.noMail++;
      continue;
    }
    const email = raw.trim();
    const row = { name: p.child?.name ?? p.name, email, receivesCommunications: true, position: 1 };
    if (p.child && p.child._count.guardians === 0) {
      if (apply) await prisma.childGuardian.create({ data: { childId: p.child.id, ...row } });
      counts.personRowsAdded++;
    } else if (p.child) counts.personAlreadyHad++;
    if (p._count.guardians === 0) {
      if (apply) await prisma.participantGuardian.create({ data: { participantId: p.id, ...row } });
      counts.registrationRowsAdded++;
    } else counts.registrationAlreadyHad++;
  }
  console.log(JSON.stringify({ database: staging ? "STAGING" : "PRODUCTION", mode: apply ? "APPLY" : "dry run (nothing written)", event: eventName, field: fieldKey, ...counts }, null, 1));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
export {};
