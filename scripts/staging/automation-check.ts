// STAGING end-to-end check of the automation (2026-11-27): a rule "complete -> own template" (baseline: nobody
// already complete is e-mailed), one person becomes complete (documents ticked), the engine records it and tries to
// send (no sending mailbox on the test event -> the claim is released for a retry), and a participants export into
// the staging Drive. Cleans up its rows; prints counts only.
//   GCS_BUCKET_NAME=… DRIVE_SERVICE_ACCOUNT_EMAIL=… MAIL_TOKEN_ENC_KEY=… bash scripts/staging/run-staging-db.sh npx tsx scripts/staging/automation-check.ts
async function main() {
  if (process.env.APP_ENV !== "staging" || !/@127\.0\.0\.1:55440\//.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: not the staging DB");
  const { prisma } = await import("../../src/lib/prisma");
  if (!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }))) throw new Error("refusing: no staging marker");
  const { runAutomation, baselineMarks, currentConditions } = await import("../../src/lib/automation");
  const { runSheetExport } = await import("../../src/lib/sheet-export");
  const event = await prisma.event.findFirstOrThrow({ where: { name: "TEST Členství 2026" } });
  const out: Record<string, unknown> = {};

  // An own template + a rule, created like the screen does (baseline first).
  const key = `custom_automation_check`;
  await prisma.eventEmailTemplate.upsert({ where: { eventId_purposeKey: { eventId: event.id, purposeKey: key } }, update: {}, create: { eventId: event.id, purposeKey: key, name: "Kontrola automatiky", subject: "Registrace kompletní", body: "Hotovo, {{participant_name}}." } });
  const before = await currentConditions(event.id);
  out.alreadyComplete = [...before.values()].filter((c) => c.has("complete")).length;
  await baselineMarks(event.id);
  const rule = await prisma.mailRule.create({ data: { eventId: event.id, condition: "complete", purposeKey: key } });
  out.firstRunSent = (await runAutomation(event.id)).sent; // nobody new -> 0

  // Make one not-complete accepted participant complete: tick every tracked document.
  const target = [...before.entries()].find(([, c]) => c.has("accepted") && !c.has("complete"))?.[0];
  out.target = !!target;
  const created: string[] = [];
  if (target) {
    const types = await prisma.eventListItem.findMany({ where: { eventId: event.id, kind: "document", active: true } });
    for (const t of types) {
      const d = await prisma.participantDocument.create({ data: { participantId: target, eventListItemId: t.id, receivedVia: "manual" } });
      created.push(d.id);
    }
    const r = await runAutomation(event.id, [target]);
    out.afterCompleteSent = r.sent;
    out.markedComplete = !!(await prisma.automationMark.findUnique({ where: { participantId_condition: { participantId: target, condition: "complete" } } }));
    out.claimReleasedWithoutMailbox = (await prisma.mailRuleSend.count({ where: { ruleId: rule.id } })) === 0;
  }

  // An export of participants into the staging Drive folder of the test package.
  const folder = "1aa-2ziKYXsrchqQZhV_0fYQu1L6efigW";
  const prevFolder = event.driveParticipantsListFolderId;
  await prisma.event.update({ where: { id: event.id }, data: { driveParticipantsListFolderId: folder } });
  const x = await prisma.sheetExport.create({ data: { eventId: event.id, name: "Kontrola exportu", kind: "participants", columns: ["f:participant_first_name", "f:participant_last_name", "status", "complete"] } });
  const r = await runSheetExport(x.id);
  out.export = { ok: r.ok, rows: r.rows, error: r.error, sheet: r.sheetId ? `https://docs.google.com/spreadsheets/d/${r.sheetId}` : null };

  // Clean up (the sheet stays in the staging Drive to look at).
  await prisma.sheetExport.delete({ where: { id: x.id } });
  await prisma.event.update({ where: { id: event.id }, data: { driveParticipantsListFolderId: prevFolder } });
  await prisma.mailRule.delete({ where: { id: rule.id } });
  await prisma.eventEmailTemplate.deleteMany({ where: { eventId: event.id, purposeKey: key } });
  await prisma.participantDocument.deleteMany({ where: { id: { in: created } } });
  if (target) await prisma.automationMark.deleteMany({ where: { participantId: target, condition: { in: ["complete", "paid"] } } });
  console.log(JSON.stringify(out, null, 1));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exit(1); });
export {};
