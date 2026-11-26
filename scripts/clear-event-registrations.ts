// Test cleanup before going live (owner's request 2026-11-26): every registration of ONE event, and the people who
// exist only because of it (no other registration anywhere) with their permanent documents, guardians, pending
// changes, e-mail log and an emptied family. People with other registrations stay (only this registration goes).
// Stored files in the app's bucket go too; copies in Google Drive are NOT touched -- the run lists their Drive file
// IDs and the event's Drive folders, to delete by hand.
// DRY RUN by default; counts and Drive IDs only.
//   ~/claude-helpers/run-db.sh npx tsx scripts/clear-event-registrations.ts "<organization>" "<event>" [--apply]
async function main() {
  const [orgName, eventName] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const apply = process.argv.includes("--apply");
  if (!orgName || !eventName) throw new Error('usage: "<organization>" "<event>" [--apply]');
  const { prisma } = await import("../src/lib/prisma");
  const { billsBucket } = await import("../src/lib/gcs");
  const { deleteParticipantCascade } = await import("../src/lib/participant-delete");
  const staging = !!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }));

  const org = await prisma.organization.findFirstOrThrow({ where: { name: orgName } });
  const event = await prisma.event.findFirstOrThrow({ where: { organizationId: org.id, name: eventName } });
  const participants = await prisma.participant.findMany({
    where: { eventId: event.id },
    select: { id: true, childId: true, documents: { select: { driveFileId: true } }, child: { select: { id: true, participants: { select: { eventId: true } } } } },
  });
  const onlyHere = [...new Set(participants.filter((p) => p.child && p.child.participants.every((x) => x.eventId === event.id)).map((p) => p.child!.id))];
  const personDocs = await prisma.personDocument.findMany({ where: { childId: { in: onlyHere } }, select: { id: true, gcsPath: true } });
  const driveFiles = participants.flatMap((p) => p.documents.map((d) => d.driveFileId)).filter((x): x is string => !!x);
  const report = {
    database: staging ? "STAGING" : "PRODUCTION",
    mode: apply ? "APPLY" : "dry run (nothing deleted)",
    event: eventName,
    registrations: participants.length,
    peopleOnlyInThisEvent: onlyHere.length,
    peopleKept: new Set(participants.map((p) => p.childId).filter(Boolean)).size - onlyHere.length,
    permanentDocumentsOfThosePeople: personDocs.length,
    driveFilesToDeleteByHand: driveFiles.map((id) => `https://drive.google.com/file/d/${id}/view`),
    driveFoldersToCheckByHand: [event.driveParticipantsFolderId, event.driveExportFolderId].filter(Boolean).map((id) => `https://drive.google.com/drive/folders/${id}`),
  };
  if (!apply) {
    console.log(JSON.stringify(report, null, 1));
    return;
  }

  for (const p of participants) await deleteParticipantCascade(p.id);
  let peopleDeleted = 0;
  for (const id of onlyHere) {
    const c = await prisma.child.findUnique({ where: { id }, select: { familyId: true, _count: { select: { participants: true } } } });
    if (!c || c._count.participants > 0) continue;
    const docs = await prisma.personDocument.findMany({ where: { childId: id }, select: { gcsPath: true } });
    await prisma.personDocument.deleteMany({ where: { childId: id } });
    await prisma.child.delete({ where: { id } });
    if (c.familyId) await prisma.family.deleteMany({ where: { id: c.familyId, members: { none: {} } } });
    await Promise.all(docs.map((d) => billsBucket.file(d.gcsPath).delete().catch(() => {})));
    peopleDeleted++;
  }
  const left = await prisma.participant.count({ where: { eventId: event.id } });
  console.log(JSON.stringify({ ...report, deleted: { registrations: participants.length - left, people: peopleDeleted }, registrationsLeft: left }, null, 1));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
export {};
