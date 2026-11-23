// Fields Manager phase 6 check (STAGING ONLY, approved 2026-11-23): one invented test Doc in the staging Drive, through
// the real editor code: classify -> queue -> save (revision-guarded) -> shared template saved as a copy. The test Doc
// and its copy go to the bin at the end; the temporary (inactive) document types and edits are removed. Prints
// statuses/counts only.
//   DRIVE_SERVICE_ACCOUNT_EMAIL=bill-scanner-drive-staging@prvni-beh-filesaver.iam.gserviceaccount.com \
//     bash scripts/staging/run-staging-db.sh npx tsx scripts/fields/doc-editor-roundtrip.ts
const STAGING_SA = "bill-scanner-drive-staging@prvni-beh-filesaver.iam.gserviceaccount.com";

async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  if (process.env.DRIVE_SERVICE_ACCOUNT_EMAIL !== STAGING_SA) throw new Error("refusing: not the staging Drive account");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  const { getDocsClient, getDriveClient, getDriveIdentity } = await import("../../src/lib/drive");
  const { analyzeTemplate, queueEdit, saveEdits } = await import("../../src/lib/doc-editor");
  const { invalidateResolverContext } = await import("../../src/lib/field-resolver");

  const event = await prisma.event.findFirstOrThrow({ where: { publicSlug: "staging-tabor-2027" }, select: { id: true, organizationId: true, location: true, driveParticipantsFolderId: true } });
  const other = await prisma.event.findFirstOrThrow({ where: { organizationId: event.organizationId, id: { not: event.id } }, select: { id: true } });
  const identity = await getDriveIdentity(event.id);
  if (identity.kind !== "service_account" || identity.email !== STAGING_SA) throw new Error("refusing: the event doesn't use the staging Drive account");
  if (!event.location || !event.driveParticipantsFolderId) throw new Error("staging event has no place / folder");
  const place = event.location;
  const folder = event.driveParticipantsFolderId;
  invalidateResolverContext();

  const drive = await getDriveClient(event.id);
  const docs = await getDocsClient(event.id);
  const user = await prisma.user.findFirstOrThrow({ select: { id: true } });
  const made: string[] = [];
  const items: string[] = [];
  const out: Record<string, unknown> = {};
  const text = async (id: string) =>
    ((await docs.documents.get({ documentId: id })).data.body?.content ?? []).map((e) => (e.paragraph?.elements ?? []).map((x) => x.textRun?.content ?? "").join("")).join("");
  try {
    // 1) The invented test Doc: an old name split by bold, an event key, spaces, a placeholder across two lines, typed place.
    const docId = (await drive.files.create({ requestBody: { name: "TEST – editor (smaže se)", mimeType: "application/vnd.google-apps.document", parents: [folder] }, supportsAllDrives: true, fields: "id" })).data.id!;
    made.push(docId);
    const body = `Milí rodiče, místo: {{event_place}},\ntábor v místě ${place} začíná {{date_range}}.\nAlergie: {{ alergie }}\nPodpis {{leader\n_name}}\n`;
    await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests: [
      { insertText: { location: { index: 1 }, text: body } },
      { updateTextStyle: { range: { startIndex: 1 + body.indexOf("event_"), endIndex: 1 + body.indexOf("event_") + 6 }, textStyle: { bold: true }, fields: "bold" } },
    ] } });
    const dt = await prisma.eventListItem.create({ data: { eventId: event.id, kind: "document", name: "TEST editor", active: false, data: { templateGoogleDocId: docId } } });
    items.push(dt.id);

    // 2) Classification.
    const a = (await analyzeTemplate(event.id, event.organizationId, dt.id))!;
    out.statuses = Object.fromEntries(a.placeholders.map((p) => [p.raw, p.canonical ? `${p.status}->${p.canonical}` : p.status]));
    out.broken = a.broken.length;
    out.typedPlace = a.typed.find((x) => x.key === "place")?.count ?? 0;
    out.sharedBefore = a.sharedWith;

    // 3) Queue edits -- nothing touches the Doc yet.
    const before = await text(docId);
    const alias = a.placeholders.find((p) => p.status === "alias")!;
    await queueEdit(event.id, event.organizationId, dt.id, user.id, { type: "rename", from: alias.key, to: alias.canonical! }, "alias");
    await queueEdit(event.id, event.organizationId, dt.id, user.id, { type: "rename", from: "alergie", to: "alergie" }, "spaces");
    await queueEdit(event.id, event.organizationId, dt.id, user.id, { type: "typed", text: place, key: "place" }, "typed");
    await queueEdit(event.id, event.organizationId, dt.id, user.id, { type: "typed", text: place, key: "place" }, "typed"); // same twice = one
    out.queued = (await analyzeTemplate(event.id, event.organizationId, dt.id))!.edits.length;
    out.docUnchangedWhileQueued = (await text(docId)) === before;

    // 4) Someone edits the Doc in Google meanwhile (positions shift) -> save re-reads and re-plans; their text stays.
    await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests: [{ insertText: { location: { index: 1 }, text: "Změna mimo aplikaci. " } }] } });
    // Google itself refuses a write against an old revision (what requiredRevisionId guards):
    const stale = (await docs.documents.get({ documentId: docId })).data.revisionId!;
    await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests: [{ insertText: { location: { index: 1 }, text: "" + "x" } }] } });
    out.staleRevisionRefused = await docs.documents
      .batchUpdate({ documentId: docId, requestBody: { requests: [{ insertText: { location: { index: 1 }, text: "y" } }], writeControl: { requiredRevisionId: stale } } })
      .then(() => false, () => true);
    await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests: [{ deleteContentRange: { range: { startIndex: 1, endIndex: 2 } } }] } }); // remove the "x"
    const saved = await saveEdits(event.id, event.organizationId, dt.id);
    out.saved = saved;
    const after = await text(docId);
    out.afterSave = {
      externalChangeKept: after.includes("Změna mimo aplikaci."),
      aliasReplaced: after.includes(`{{${alias.canonical}}}`) && !after.includes("{{event_place}}"),
      spacesFixed: after.includes("{{alergie}}") && !after.includes("{{ alergie }}"),
      typedReplaced: after.includes("tábor v místě {{place}} začíná") && !after.includes(place),
      brokenUntouched: after.includes("Podpis {{leader\n_name}}"),
    };
    const re = (await analyzeTemplate(event.id, event.organizationId, dt.id))!;
    out.afterStatuses = Object.fromEntries(re.placeholders.map((p) => [p.raw, p.status]));
    out.pendingAfterSave = re.edits.length;

    // 5) Shared template: another event's document type uses the same Doc -> only "save as a copy" for this event.
    const dt2 = await prisma.eventListItem.create({ data: { eventId: other.id, kind: "document", name: "TEST editor (jiná akce)", active: false, data: { templateGoogleDocId: docId } } });
    items.push(dt2.id);
    await queueEdit(event.id, event.organizationId, dt.id, user.id, { type: "typed", text: "Podpis", key: "signature_line" }, "typed");
    out.sharedRefusedWithoutCopy = await saveEdits(event.id, event.organizationId, dt.id);
    const copied = await saveEdits(event.id, event.organizationId, dt.id, { copy: true });
    if ("docId" in copied) made.push(copied.docId as string);
    const nowUses = ((await prisma.eventListItem.findUniqueOrThrow({ where: { id: dt.id } })).data as { templateGoogleDocId: string }).templateGoogleDocId;
    const otherUses = ((await prisma.eventListItem.findUniqueOrThrow({ where: { id: dt2.id } })).data as { templateGoogleDocId: string }).templateGoogleDocId;
    out.shared = {
      copied: "copied" in copied && copied.copied,
      thisEventUsesCopy: "docId" in copied && nowUses === copied.docId && nowUses !== docId,
      otherEventKeepsOriginal: otherUses === docId,
      originalUntouched: (await text(docId)) === after,
      copyEdited: "docId" in copied && (await text(copied.docId as string)).includes("{{signature_line}}"),
    };
  } finally {
    for (const id of made) await drive.files.update({ fileId: id, requestBody: { trashed: true }, supportsAllDrives: true }).catch(() => (out.trashFailed = true));
    const ids = [...made];
    await prisma.documentEdit.deleteMany({ where: { organizationId: event.organizationId, googleDocId: { in: ids } } });
    await prisma.eventListItem.deleteMany({ where: { id: { in: items } } });
    out.cleanedUp = { docsBinned: made.length, documentTypesRemoved: items.length };
    console.log(JSON.stringify(out, null, 1));
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err instanceof Error ? err.stack : err); process.exit(1); });

export {};
