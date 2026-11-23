// Fields Manager phase 7 check (STAGING ONLY): invented duplicates (`alergie` next to `allergies`), merged both ways,
// merged + deleted, `adresa` made calculated -- after every undo the data must be byte-identical; the invented
// duplicates are removed at the end and the database must be back exactly as before. Prints counts only.
//   bash scripts/staging/run-staging-db.sh npx tsx scripts/fields/merge-roundtrip.ts
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  const { Prisma } = await import("../../src/generated/prisma");
  const json = (v: unknown) => (v === null || v === undefined ? Prisma.DbNull : (v as object));
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  const { applyMerge, deleteMergedFields, makeCalculated, mergePreview, undoChange, calculatedLoss } = await import("../../src/lib/field-merge");
  const { loadResolverContext, classifyKey, invalidateResolverContext } = await import("../../src/lib/field-resolver");
  const { updateSyncs } = await import("../../src/lib/participant-sync-run");

  const event = await prisma.event.findFirstOrThrow({ where: { publicSlug: "staging-tabor-2027" }, select: { id: true, organizationId: true, participantsListColumns: true } });
  const org = event.organizationId;

  const snapshot = async () =>
    JSON.stringify({
      templates: await prisma.participantFieldTemplate.findMany({ where: { organizationId: org }, orderBy: { id: "asc" } }),
      copies: await prisma.eventParticipantField.findMany({ where: { event: { organizationId: org } }, orderBy: { id: "asc" } }),
      children: await prisma.child.findMany({ where: { organizationId: org }, select: { id: true, fieldValues: true }, orderBy: { id: "asc" } }),
      participants: await prisma.participant.findMany({ where: { event: { organizationId: org } }, select: { id: true, customFieldValues: true }, orderBy: { id: "asc" } }),
      events: await prisma.event.findMany({ where: { organizationId: org }, select: { id: true, participantsListColumns: true, documentsListColumns: true, healthListColumns: true, exportColumns: true, participantLayout: true, healthNotes: true, participantSyncs: true }, orderBy: { id: "asc" } }),
      org: await prisma.organization.findUniqueOrThrow({ where: { id: org }, select: { exportColumns: true } }),
      aliases: await prisma.fieldAlias.findMany({ where: { organizationId: org }, orderBy: { id: "asc" } }),
      kitchen: await prisma.eventKitchenSettings.findMany({ where: { event: { organizationId: org } }, orderBy: { eventId: "asc" } }),
    });
  const out: Record<string, unknown> = {};
  const pristine = await snapshot();

  // ---- seed invented duplicates -------------------------------------------------------------------------------
  // Both sides invented when staging doesn't have them (the real groups exist only in production).
  const made: { tpl: string[]; copy: string[] } = { tpl: [], copy: [] };
  if (!(await prisma.participantFieldTemplate.findFirst({ where: { organizationId: org, key: "allergies" } }))) made.tpl.push((await prisma.participantFieldTemplate.create({ data: { organizationId: org, key: "allergies", label: "Alergie (TEST)", fieldType: "text", portalAccess: "hidden", defaultSurfaces: ["list"] } })).id);
  if (!(await prisma.eventParticipantField.findFirst({ where: { eventId: event.id, key: "allergies" } }))) made.copy.push((await prisma.eventParticipantField.create({ data: { eventId: event.id, key: "allergies", label: "Alergie (TEST)", fieldType: "text", isFromTemplate: true, surfaces: ["list"] } })).id);
  const tpl = await prisma.participantFieldTemplate.create({ data: { organizationId: org, key: "alergie", label: "Alergie (duplicitní, TEST)", fieldType: "text", portalAccess: "hidden", defaultSurfaces: ["list"] } });
  const copy = await prisma.eventParticipantField.create({ data: { eventId: event.id, key: "alergie", label: "Alergie (duplicitní, TEST)", fieldType: "text", isFromTemplate: true, surfaces: ["list"] } });
  const ps = await prisma.participant.findMany({ where: { eventId: event.id }, select: { id: true, customFieldValues: true }, orderBy: { id: "asc" }, take: 9 });
  const seeded: { id: string; before: unknown }[] = [];
  for (const [i, p] of ps.entries()) {
    const m = { ...((p.customFieldValues as Record<string, unknown> | null) ?? {}) };
    seeded.push({ id: p.id, before: p.customFieldValues });
    m.alergie = `test alergie ${i % 3}`;
    if (i % 3 === 0) m.allergies = "";
    if (i % 3 === 1) m.allergies = "jiná hodnota";
    if (i % 3 === 2) m.allergies = `test alergie ${i % 3}`;
    await prisma.participant.update({ where: { id: p.id }, data: { customFieldValues: m as object } });
  }
  const colsBefore = event.participantsListColumns;
  await prisma.event.update({ where: { id: event.id }, data: { participantsListColumns: ["Name", "alergie"] } });
  const syncId = `merge-test-${Date.now()}`;
  await updateSyncs(event.id, (l) => [...l, { id: syncId, name: "merge test", sheetId: "none", mapping: { Alergie: "alergie" }, matchBy: "__name", onNew: "report", onMatch: "fill", overrides: {}, excluded: [], autoSync: false, everyHours: 6, seenKeys: [] }]);
  const seededState = await snapshot();

  try {
    // ---- A) alergie -> allergies, alias mode ----------------------------------------------------------------
    out.previewA = await mergePreview(org, "allergies", ["alergie"]);
    const a = await applyMerge(org, null, "allergies", ["alergie"], "alias");
    invalidateResolverContext();
    const ctx = await loadResolverContext(event.id);
    const ev = await prisma.event.findUniqueOrThrow({ where: { id: event.id }, select: { participantsListColumns: true, participantSyncs: true } });
    out.afterA = {
      moved: (a.after as { moved: number }).moved,
      conflicts: (a.after as { conflicts: unknown[] }).conflicts.length,
      oldFieldInactive: !(await prisma.eventParticipantField.findUniqueOrThrow({ where: { id: copy.id } })).active,
      aliasResolves: classifyKey("alergie", ctx, new Set(["allergies"])),
      columnsPointAtTarget: JSON.stringify(ev.participantsListColumns) === JSON.stringify(["Name", "allergies"]),
      syncPointsAtTarget: (ev.participantSyncs as { id: string; mapping: Record<string, string> }[]).find((s) => s.id === syncId)?.mapping.Alergie === "allergies",
    };
    out.undoA = await undoChange(org, a.id);
    out.identicalAfterUndoA = (await snapshot()) === seededState;

    // ---- B) the other way: allergies -> alergie ----------------------------------------------------------------
    const b = await applyMerge(org, null, "alergie", ["allergies"], "alias");
    out.movedB = (b.after as { moved: number }).moved;
    out.undoB = await undoChange(org, b.id);
    out.identicalAfterUndoB = (await snapshot()) === seededState;

    // ---- C) merge, then delete the merged field; undo delete, undo merge ----------------------------------------
    const c = await applyMerge(org, null, "allergies", ["alergie"], "alias");
    const del = await deleteMergedFields(org, null, c.id);
    out.deleted = del.after;
    out.fieldGone = !(await prisma.eventParticipantField.findUnique({ where: { id: copy.id } })) && !(await prisma.participantFieldTemplate.findUnique({ where: { id: tpl.id } }));
    out.undoMergeBeforeDelete = await undoChange(org, c.id); // must refuse: the delete comes first
    out.undoDelete = await undoChange(org, del.id);
    out.undoC = await undoChange(org, c.id);
    out.identicalAfterUndoC = (await snapshot()) === seededState;

    // ---- D) adresa -> calculated from the split address, filling the street where all parts are empty ------------
    // Staging's own `adresa` is already composite: an invented stored address field stands in for production's.
    const parts = ["ulice", "psc", "mesto"];
    const at = await prisma.participantFieldTemplate.create({ data: { organizationId: org, key: "adresa_test", label: "Adresa (TEST)", fieldType: "text", portalAccess: "hidden", defaultSurfaces: ["list"] } });
    const ac = await prisma.eventParticipantField.create({ data: { eventId: event.id, key: "adresa_test", label: "Adresa (TEST)", fieldType: "text", isFromTemplate: true, surfaces: ["list"] } });
    made.tpl.push(at.id);
    made.copy.push(ac.id);
    for (const [i, x] of seeded.entries()) {
      const p = await prisma.participant.findUniqueOrThrow({ where: { id: x.id }, select: { customFieldValues: true } });
      const m: Record<string, unknown> = { ...((p.customFieldValues as Record<string, unknown> | null) ?? {}), adresa_test: `Testovací ${i}, 000 00 Testov` };
      if (i % 2 === 0) for (const k of parts) delete m[k]; // half have no split address at all
      await prisma.participant.update({ where: { id: x.id }, data: { customFieldValues: m as object } });
    }
    const withAddress = await snapshot();
    out.calcLoss = await calculatedLoss(org, "adresa_test", parts);
    const d = await makeCalculated(org, null, "adresa_test", { kind: "join", parts, separator: ", " }, "ulice");
    out.calcFilled = (d.after as { filled: number }).filled;
    out.calcLossAfter = await calculatedLoss(org, "adresa_test", parts);
    out.nowCalculated = (await prisma.eventParticipantField.findUniqueOrThrow({ where: { id: ac.id } })).fieldType === "calculated";
    out.undoD = await undoChange(org, d.id);
    out.identicalAfterUndoD = (await snapshot()) === withAddress;
  } finally {
    // ---- remove the invented duplicates ---------------------------------------------------------------------
    await prisma.eventParticipantField.deleteMany({ where: { id: { in: [copy.id, ...made.copy] } } });
    await prisma.participantFieldTemplate.deleteMany({ where: { id: { in: [tpl.id, ...made.tpl] } } });
    for (const s of seeded) await prisma.participant.update({ where: { id: s.id }, data: { customFieldValues: json(s.before) as never } });
    await prisma.event.update({ where: { id: event.id }, data: { participantsListColumns: json(colsBefore) as never } });
    await updateSyncs(event.id, (l) => l.filter((s) => s.id !== syncId));
    await prisma.fieldAlias.deleteMany({ where: { organizationId: org, alias: { in: ["alergie", "allergies"] }, reason: "merge" } });
    await prisma.fieldChangeLog.deleteMany({ where: { organizationId: org, action: { in: ["merge", "delete_fields", "make_calculated"] }, at: { gte: new Date(Date.now() - 3600_000) }, byId: null } });
    out.backToPristine = (await snapshot()) === pristine;
    console.log(JSON.stringify(out, null, 1));
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err instanceof Error ? err.stack : err); process.exit(1); });

export {};
