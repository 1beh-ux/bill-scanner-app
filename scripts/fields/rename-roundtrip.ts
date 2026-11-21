// Fields Manager phase 3b check (STAGING ONLY): rename a field and undo it; the data must come back identical.
//   bash scripts/staging/run-staging-db.sh npx tsx scripts/fields/rename-roundtrip.ts [from] [to]
// Prints counts only.
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  const { applyRename, renamePreview } = await import("../../src/lib/field-rename");
  const from = process.argv[2] ?? "pojistovna";
  const to = process.argv[3] ?? "zdravotni_pojistovna";
  const org = await prisma.organization.findFirstOrThrow({ select: { id: true } });

  // Everything a rename touches, keyed by row id, so the round trip can be compared exactly.
  const snapshot = async () =>
    JSON.stringify({
      templates: await prisma.participantFieldTemplate.findMany({ where: { organizationId: org.id }, select: { id: true, key: true, options: true }, orderBy: { id: "asc" } }),
      eventFields: await prisma.eventParticipantField.findMany({ select: { id: true, key: true, options: true }, orderBy: { id: "asc" } }),
      children: await prisma.child.findMany({ select: { id: true, fieldValues: true }, orderBy: { id: "asc" } }),
      participants: await prisma.participant.findMany({ select: { id: true, customFieldValues: true }, orderBy: { id: "asc" } }),
      events: await prisma.event.findMany({ select: { id: true, participantSyncs: true, participantsListColumns: true, documentsListColumns: true, healthListColumns: true, exportColumns: true, participantLayout: true, healthNotes: true }, orderBy: { id: "asc" } }),
      aliases: await prisma.fieldAlias.findMany({ where: { organizationId: org.id }, select: { alias: true, targetKey: true }, orderBy: { alias: "asc" } }),
    });
  const count = async (k: string) => ({
    templates: await prisma.participantFieldTemplate.count({ where: { organizationId: org.id, key: k } }),
    eventCopies: await prisma.eventParticipantField.count({ where: { key: k } }),
    profileValues: (await prisma.child.findMany({ select: { fieldValues: true } })).filter((c) => c.fieldValues && k in (c.fieldValues as object)).length,
    registrationValues: (await prisma.participant.findMany({ select: { customFieldValues: true } })).filter((p) => p.customFieldValues && k in (p.customFieldValues as object)).length,
  });

  const before = await snapshot();
  const preview = await renamePreview(org.id, from, to);
  console.log("preview:", JSON.stringify(preview));
  if (preview.blocker) throw new Error(`blocked: ${preview.blocker}`);
  const countsBefore = await count(from);
  const log = await applyRename(org.id, null, from, to);
  const afterRename = { old: await count(from), new: await count(to), alias: await prisma.fieldAlias.count({ where: { organizationId: org.id, alias: from, targetKey: to } }) };
  console.log("before:", JSON.stringify(countsBefore), "after rename:", JSON.stringify(afterRename));
  if (JSON.stringify(afterRename.new) !== JSON.stringify(countsBefore) || afterRename.old.eventCopies + afterRename.old.templates + afterRename.old.profileValues + afterRename.old.registrationValues !== 0 || afterRename.alias !== 1) throw new Error("rename did not move everything");

  await applyRename(org.id, null, to, from, { alias: false, logId: log.id });
  const identical = (await snapshot()) === before;
  const undone = (await prisma.fieldChangeLog.findUniqueOrThrow({ where: { id: log.id } })).undoneAt !== null;
  console.log(JSON.stringify({ identicalAfterUndo: identical, logMarkedUndone: undone }));
  if (!identical || !undone) process.exit(1);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });

export {};
