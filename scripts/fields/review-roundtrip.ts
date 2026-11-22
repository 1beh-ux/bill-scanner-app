// Fields Manager phase 5 check (STAGING ONLY): automatic runs queue uncertain rows instead of writing them, a re-run
// doesn't duplicate items, resolving applies through the import path; then everything is undone and the test
// connection removed -- counts must be back exactly. Invented rows (the test sheets' layout), no Google access.
//   bash scripts/staging/run-staging-db.sh npx tsx scripts/fields/review-roundtrip.ts
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  const { loadImportFields, loadSyncs, runWithReview, updateSyncs } = await import("../../src/lib/participant-sync-run");
  const { guessMapping, slotMapping, NEW_PERSON } = await import("../../src/lib/participant-sync");
  const { resolveItem } = await import("../../src/lib/sync-review-run");
  const { undoImportRun } = await import("../../src/lib/import-run");

  const event = await prisma.event.findFirstOrThrow({ where: { publicSlug: "staging-tabor-2027" }, select: { id: true, organizationId: true } });
  const admin = await prisma.user.findFirstOrThrow({ select: { id: true } });
  const fields = await loadImportFields(event.id);
  const headers = ["Jméno", "Příjmení", "Datum narození", "E-mail rodiče", "Poznámka"];
  const note = fields.find((f) => f.kind === "custom" && f.fieldType === "text");
  if (!note) throw new Error("no text field");
  const mapping = { ...slotMapping(headers, guessMapping(headers, fields)), "Poznámka": note.key };
  const first = [
    ["Rvtest", "Sešitový", "2015-03-14", "rv.sesitovy@example.invalid", "A"],
    ["Rvtest", "Tužková", "2016-07-02", "rv.tuzkova@example.invalid", "B"],
  ];
  const second = [
    first[0].slice(0, 4).concat("A2"), // filled value changed -> difference (policy keep)
    first[1],
    ["Sešitový", "Rvtest", "14. 3. 2015", "rv.sesitovy@example.invalid", ""], // swapped name, same birth date -> possible match
    ["Rvtestová", "Nová", "2018-01-01", "rv.nova@example.invalid", ""], // plain new
  ];
  const counts = async () => ({
    participants: await prisma.participant.count({ where: { eventId: event.id } }),
    people: await prisma.child.count({ where: { organizationId: event.organizationId } }),
    guardians: await prisma.participantGuardian.count({ where: { participant: { eventId: event.id } } }),
  });
  const before = await counts();
  const syncId = `review-test-${Date.now()}`;
  await updateSyncs(event.id, (l) => [...l, { id: syncId, name: "review test", sheetId: "none", mapping, matchBy: "__name", onNew: "create", onMatch: "fill", overrides: {}, excluded: [], autoSync: false, everyHours: 6, seenKeys: [], policy: { all: "keep" } }]);
  const sync = async () => (await loadSyncs(event.id)).find((s) => s.id === syncId)!;
  const runs: string[] = [];
  const pending = () => prisma.syncReviewItem.findMany({ where: { eventId: event.id, syncId, status: "pending" }, orderBy: { kind: "asc" } });
  try {
    const r1 = await runWithReview(event.id, await sync(), { headers, rows: first }, fields);
    if (r1.runId) runs.push(r1.runId);
    const r2 = await runWithReview(event.id, await sync(), { headers, rows: second }, fields);
    if (r2.runId) runs.push(r2.runId);
    const items1 = await pending();
    const r3 = await runWithReview(event.id, await sync(), { headers, rows: second }, fields); // same again
    if (r3.runId) runs.push(r3.runId);
    const items2 = await pending();
    const kinds = items2.map((i) => i.kind);

    // Resolve: the swapped name is a new person after all; the changed value is taken from the table.
    const pm = items2.find((i) => i.kind === "possible_match")!;
    const diff = items2.find((i) => i.kind === "difference")!;
    const a = await resolveItem(event.id, event.organizationId, pm.id, admin.id, { action: "apply", choice: NEW_PERSON });
    const b = await resolveItem(event.id, event.organizationId, diff.id, admin.id, { action: "apply", always: true });
    for (const x of [a, b]) if ("runId" in x && x.runId) runs.push(x.runId);
    const r4 = await runWithReview(event.id, await sync(), { headers, rows: second }, fields); // resolved -> nothing comes back
    if (r4.runId) runs.push(r4.runId);
    const after = await pending();

    console.log(JSON.stringify({
      run1: r1.applied.counts, run2: r2.applied.counts, run3: r3.applied.counts, run4: r4.applied.counts,
      queued: kinds, sameItemsOnRerun: items1.map((i) => i.id).join() === items2.map((i) => i.id).join(),
      resolved: ["ok" in a, "ok" in b], pendingAfterResolve: after.length,
    }));
  } finally {
    for (const id of runs.reverse()) await undoImportRun(event.id, id);
    await prisma.syncReviewItem.deleteMany({ where: { eventId: event.id, syncId } });
    await prisma.importRun.deleteMany({ where: { eventId: event.id, syncId } });
    await updateSyncs(event.id, (l) => l.filter((s) => s.id !== syncId));
  }
  const back = await counts();
  console.log(JSON.stringify({ before, back, identical: JSON.stringify(before) === JSON.stringify(back) }));
  if (JSON.stringify(before) !== JSON.stringify(back)) process.exit(1);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err instanceof Error ? err.stack : err); process.exit(1); });

export {};
