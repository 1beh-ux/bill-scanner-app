// Fields Manager phase 4 check (STAGING ONLY): the old import and the wizard, with the same choices, must write the
// same registrations; undo must bring the counts (and the values) back exactly. Invented rows only; prints counts.
//   bash scripts/staging/run-staging-db.sh npx tsx scripts/fields/import-replay.ts
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  const { applyPlan, loadImportFields, planFor } = await import("../../src/lib/participant-sync-run");
  const { guessMapping, slotMapping, sanitizeSettings, policyOf } = await import("../../src/lib/participant-sync");
  const { createdPeople, recordImportRun, undoImportRun, writeProfileValues } = await import("../../src/lib/import-run");

  const event = await prisma.event.findFirstOrThrow({ where: { publicSlug: "staging-tabor-2027" }, select: { id: true, organizationId: true } });
  const existing = await prisma.participant.findMany({ where: { eventId: event.id, dateOfBirth: { not: null } }, take: 3, orderBy: { name: "asc" }, select: { name: true, dateOfBirth: true } });
  const fields = await loadImportFields(event.id);
  const custom = fields.find((f) => f.kind === "custom" && (f.fieldType === "text" || f.fieldType === "longtext"));
  if (!custom) throw new Error("no text field on the staging event");

  // Last year's column layout (headers), invented rows: 3 people already registered + 3 new ones.
  const headers = ["Jméno a příjmení dítěte", "Datum narození", "E-mail zákonného zástupce", "Jméno zákonného zástupce", "Telefon", "E-mail 2. zástupce", custom.label];
  const day = (d: Date) => `${d.getUTCDate()}. ${d.getUTCMonth() + 1}. ${d.getUTCFullYear()}`;
  const rows = [
    ...existing.map((p, i) => [p.name, day(p.dateOfBirth!), `replay${i}@example.invalid`, `Replay Rodič ${i}`, "", "", `replay hodnota ${i}`]),
    ...[0, 1, 2].map((i) => [`Replay Nový${i} Testovací`, `${i + 1}. 6. 2016`, `novy${i}@example.invalid`, `Replay Rodič N${i}`, "+420000000000", i === 0 ? `druhy${i}@example.invalid` : "", `nová ${i}`]),
  ];
  const table = { headers, rows };

  const snapshot = async () => {
    const ps = await prisma.participant.findMany({ where: { eventId: event.id }, orderBy: { name: "asc" }, include: { guardians: { orderBy: { email: "asc" } } } });
    return ps.map((p) => ({ name: p.name, first: p.firstName, last: p.lastName, dob: p.dateOfBirth?.toISOString() ?? null, group: p.groupName, values: p.customFieldValues, guardians: p.guardians.map((g) => [g.email, g.name, g.phone, g.relationship]) }));
  };
  const counts = async () => ({
    participants: await prisma.participant.count({ where: { eventId: event.id } }),
    guardians: await prisma.participantGuardian.count({ where: { participant: { eventId: event.id } } }),
    people: await prisma.child.count({ where: { organizationId: event.organizationId } }),
    profileGuardians: await prisma.childGuardian.count({ where: { child: { organizationId: event.organizationId } } }),
    families: await prisma.family.count({ where: { organizationId: event.organizationId } }),
  });
  const runOnce = async (settings: ReturnType<typeof sanitizeSettings>, wizard: boolean) => {
    const plan = await planFor(event.id, table, settings, fields, []);
    const started = new Date();
    const applied = await applyPlan(event.id, plan);
    const profile = wizard ? await writeProfileValues(event.organizationId, applied.writes, policyOf(settings)) : [];
    const people = await createdPeople(applied.writes, started);
    const run = await recordImportRun(event.id, null, null, [...applied.writes, ...people, ...profile]);
    return { run, counts: applied.counts, profile: profile.length };
  };

  const before = { snap: JSON.stringify(await snapshot()), counts: await counts() };
  const mapping = guessMapping(headers, fields);
  mapping[custom.label] = custom.key;

  // 1) The old import page's settings.
  const old = await runOnce(sanitizeSettings({ mapping, onMatch: "fill" }), false);
  const afterOld = JSON.stringify(await snapshot());
  const undoOld = await undoImportRun(event.id, old.run.id);
  const backAfterOld = JSON.stringify(await snapshot()) === before.snap && JSON.stringify(await counts()) === JSON.stringify(before.counts);

  // 2) The wizard with the same choices (guardian columns as explicit slots, policy keep = old "fill").
  const wiz = await runOnce(sanitizeSettings({ mapping: slotMapping(headers, mapping), policy: { all: "keep" } }), true);
  const afterWizard = JSON.stringify(await snapshot());
  const undoWiz = await undoImportRun(event.id, wiz.run.id);
  const backAfterWizard = JSON.stringify(await snapshot()) === before.snap && JSON.stringify(await counts()) === JSON.stringify(before.counts);

  console.log(JSON.stringify({ planned: old.counts, wizardProfileValues: wiz.profile, sameResult: afterOld === afterWizard, undoOld, undoWiz, backAfterOld, backAfterWizard, countsNow: await counts(), countsBefore: before.counts }));
  if (afterOld !== afterWizard || !backAfterOld || !backAfterWizard) process.exit(1);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });

export {};
