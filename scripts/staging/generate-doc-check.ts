// STAGING check of "Vytvořit": generates one participant's document from its template (staging bucket + staging Drive
// account only). Prints sizes, no content.
//   GCS_BUCKET_NAME=bill-scanner-v2-files-staging DRIVE_SERVICE_ACCOUNT_EMAIL=<staging SA> \
//   bash scripts/staging/run-staging-db.sh npx tsx scripts/staging/generate-doc-check.ts "<event>" "<name part>" "<doc key>"
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  if (process.env.GCS_BUCKET_NAME !== "bill-scanner-v2-files-staging") throw new Error("refusing: GCS_BUCKET_NAME must be the staging bucket");
  if (!/staging/.test(process.env.DRIVE_SERVICE_ACCOUNT_EMAIL ?? "")) throw new Error("refusing: the staging Drive account is required");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  const { documentAttachmentsFor } = await import("../../src/lib/participant-bulk-email");
  const [eventName, namePart, key] = process.argv.slice(2);
  const event = await prisma.event.findFirstOrThrow({ where: { name: eventName } });
  const p = await prisma.participant.findFirstOrThrow({ where: { eventId: event.id, name: { contains: namePart } } });
  const dt = await prisma.eventListItem.findFirstOrThrow({ where: { eventId: event.id, key } });
  const user = await prisma.user.findFirstOrThrow({ select: { id: true } });
  const r = await documentAttachmentsFor(p.id, event, [dt.id], user.id, new Map());
  const stored = await prisma.participantDocument.count({ where: { participantId: p.id, eventListItemId: dt.id, receivedVia: "generated" } });
  console.log(JSON.stringify({ pdfBytes: r.attachments[0]?.buffer.length ?? 0, failed: r.failedDocuments, storedAsGenerated: stored }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
export {};
