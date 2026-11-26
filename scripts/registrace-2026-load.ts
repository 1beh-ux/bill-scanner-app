// Registrace 2026 (owner's request 2026-11-26): the 2026 membership year of Pionýrská skupina Záře as closed history --
// the base the 2027 portal offer checks ("accepted in 2026"). Loads the member list from a Google Sheet (the app's
// own import: column mapping by label, people created/linked in Lidé, undoable in Pole -> Nástroje -> Import), marks
// everyone accepted, and stores each person's signed registration list (PDF from one Drive folder, the person's
// name in the file name) as their permanent "Registrační list" -- so 2027 counts it "z profilu".
//
// DRY RUN by default (reads the Sheet and the folder, writes nothing). Prints counts, column names and Drive file IDs
// only -- never names or values.
//   ~/claude-helpers/run-db.sh npx tsx scripts/registrace-2026-load.ts --sheet <url|id> --folder <url|id> [--tab <name>] [--apply]
// Production needs the production Drive account and keys in the environment (see the command in the release notes);
// the Sheet and the folder must be shared with the Drive account the organization's events use.
const ORG = "Pionýrská skupina Záře";
const EVENT_NAME = "Registrace 2026";
const DOC_TEMPLATE_NAME = "Registrační list";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const idOf = (s: string | undefined) => (s?.match(/[-\w]{25,}/)?.[0] ?? "");
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function main() {
  const apply = process.argv.includes("--apply");
  const sheetId = idOf(arg("sheet"));
  const folderId = idOf(arg("folder"));
  if (!sheetId || !folderId) throw new Error("usage: --sheet <url|id> --folder <url|id> [--tab <name>] [--apply]");

  const { prisma } = await import("../src/lib/prisma");
  const staging = !!(await prisma.appSetting.findUnique({ where: { key: "staging_marker" } }));
  const { readSyncSheet, loadImportFields, applyPlan } = await import("../src/lib/participant-sync-run");
  const { guessMappingByLabel, slotMapping, planSync, countPlan, MATCH_BY_NAME, policyOf } = await import("../src/lib/participant-sync");
  const { createdPeople, recordImportRun, writeProfileValues } = await import("../src/lib/import-run");
  const { getDriveClient } = await import("../src/lib/drive");
  const { createEventWithDefaults } = await import("../src/lib/event-create");
  const { storeParticipantFile } = await import("../src/lib/participant-document-store");
  const { promoteToPersonDocument } = await import("../src/lib/person-documents");

  const org = await prisma.organization.findFirstOrThrow({ where: { name: ORG } });
  const template = await prisma.listTemplate.findFirstOrThrow({ where: { organizationId: org.id, kind: "document", name: DOC_TEMPLATE_NAME } });
  if ((template.data as { permanent?: boolean } | null)?.permanent !== true) throw new Error(`"${DOC_TEMPLATE_NAME}" is not marked "platí trvale"`);
  const existing = await prisma.event.findFirst({ where: { organizationId: org.id, name: EVENT_NAME } });
  if (existing && apply) throw new Error(`"${EVENT_NAME}" already exists -- not loading twice (undo its import or delete it first)`);
  // Drive access + field list: the new event, or (dry run) the organization's membership year as a stand-in.
  const probe = existing ?? (await prisma.event.findFirstOrThrow({ where: { organizationId: org.id, kind: "membership" }, orderBy: { startDate: "desc" } }));

  // 1. The Sheet and the mapping.
  const sheet = await readSyncSheet(probe.id, sheetId, arg("tab"));
  if ("error" in sheet) throw new Error(`the Sheet can't be read: ${sheet.error.code} (share it with the organization's Drive account)`);
  const fields = await loadImportFields(probe.id);
  const mapping = slotMapping(sheet.headers, guessMappingByLabel(sheet.headers, fields));
  const settings = { mapping, matchBy: MATCH_BY_NAME, onNew: "create" as const, onMatch: "fill" as const, overrides: {}, excluded: [] };
  const plan = planSync({ headers: sheet.headers, rows: sheet.rows, settings, fields, existing: [], seenKeys: [] });

  // 2. The PDFs: every PDF in the folder, matched to a row by first + last name in the file name (unique only).
  const drive = await getDriveClient(probe.id);
  const files: { id: string; name: string }[] = [];
  let pageToken: string | undefined;
  do {
    const r = await drive.files.list({ q: `'${folderId}' in parents and trashed = false and mimeType = 'application/pdf'`, fields: "nextPageToken, files(id,name)", supportsAllDrives: true, includeItemsFromAllDrives: true, pageSize: 200, pageToken });
    files.push(...(r.data.files ?? []).map((f) => ({ id: f.id!, name: f.name ?? "" })));
    pageToken = r.data.nextPageToken ?? undefined;
  } while (pageToken);
  const rowsToCreate = plan.filter((r) => r.status === "create" && r.create);
  const words = (s: string) => new Set(fold(s).split(" "));
  const fileFor = new Map<number, string>();
  const ambiguous: string[] = [];
  const unmatched: string[] = [];
  for (const f of files) {
    const w = words(f.name.replace(/\.pdf$/i, ""));
    const hits = rowsToCreate.filter((r) => {
      const first = fold(r.create!.firstName), last = fold(r.create!.lastName);
      return !!first && !!last && first.split(" ").every((x) => w.has(x)) && last.split(" ").every((x) => w.has(x));
    });
    if (hits.length === 1 && !fileFor.has(hits[0].rowNumber)) fileFor.set(hits[0].rowNumber, f.id);
    else if (hits.length > 1 || (hits.length === 1 && fileFor.has(hits[0].rowNumber))) ambiguous.push(f.id);
    else unmatched.push(f.id);
  }

  const report = {
    database: staging ? "STAGING" : "PRODUCTION",
    mode: apply ? "APPLY" : "dry run (nothing written)",
    sheet: { rows: sheet.rows.length, tab: sheet.tab },
    mapping: Object.fromEntries(Object.entries(mapping).map(([h, t]) => [h, t === "ignore" ? "— nepřevádět" : (fields.find((f) => f.key === t)?.label ?? t)])),
    plan: countPlan(plan),
    rowProblems: plan.filter((r) => r.status === "error").length,
    pdfs: { inFolder: files.length, matched: fileFor.size, ambiguousFileIds: ambiguous, unmatchedFileIds: unmatched },
    peopleWithoutPdf: rowsToCreate.length - fileFor.size,
  };
  if (!apply) {
    console.log(JSON.stringify(report, null, 1));
    return;
  }

  // 3. The event: membership year 2026, history only (not in the portal, no public form), only the registration list.
  const created = await createEventWithDefaults({ name: EVENT_NAME, startDate: "2026-01-01", endDate: "2026-12-31", organizationId: org.id, isPublic: false });
  const event = await prisma.event.update({
    where: { id: created.id },
    data: { kind: "membership", membershipYear: 2026, registrationConnected: true, peopleLinkMode: "all", portalOpen: false, publicRegistration: false, autoAccept: "manual" },
  });
  const model = await prisma.event.findFirst({ where: { organizationId: org.id, kind: "membership", id: { not: event.id } }, orderBy: { startDate: "desc" }, select: { id: true } });
  if (model) {
    for (const m of await prisma.eventModule.findMany({ where: { eventId: model.id } }))
      await prisma.eventModule.upsert({ where: { eventId_moduleKey: { eventId: event.id, moduleKey: m.moduleKey } }, update: { enabled: m.enabled }, create: { eventId: event.id, moduleKey: m.moduleKey, enabled: m.enabled } });
  }
  await prisma.eventListItem.updateMany({ where: { eventId: event.id, kind: "document", NOT: { key: template.key } }, data: { active: false } });
  const docType = await prisma.eventListItem.findFirstOrThrow({ where: { eventId: event.id, kind: "document", key: template.key } });

  // 4. The import (the app's own -- recorded, undoable), people linked/created in Lidé, everyone accepted.
  const eventFields = await loadImportFields(event.id);
  const finalPlan = planSync({ headers: sheet.headers, rows: sheet.rows, settings, fields: eventFields, existing: [], seenKeys: [] });
  const started = new Date();
  const applied = await applyPlan(event.id, finalPlan);
  const profileWrites = await writeProfileValues(org.id, applied.writes, policyOf(settings));
  const people = await createdPeople(applied.writes, started);
  await recordImportRun(event.id, null, null, [...applied.writes, ...people, ...profileWrites]);
  const accepted = await prisma.participant.updateMany({ where: { eventId: event.id }, data: { registrationStatus: "accepted" } });

  // 5. The PDFs onto the registrations, received, and kept on the person (platí trvale).
  const participants = await prisma.participant.findMany({ where: { eventId: event.id }, select: { id: true, firstName: true, lastName: true, childId: true } });
  let stored = 0, onPerson = 0;
  const notStored: string[] = [];
  for (const [rowNumber, fileId] of fileFor) {
    const row = finalPlan.find((r) => r.rowNumber === rowNumber)?.create;
    const p = row && participants.find((x) => fold(x.firstName ?? "") === fold(row.firstName) && fold(x.lastName ?? "") === fold(row.lastName));
    if (!p) {
      notStored.push(fileId);
      continue;
    }
    const meta = files.find((f) => f.id === fileId)!;
    const data = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
    const buffer = Buffer.from(data.data as ArrayBuffer);
    const s = await storeParticipantFile(event.id, p.id, buffer, meta.name, "application/pdf");
    const doc = await prisma.participantDocument.create({ data: { participantId: p.id, eventListItemId: docType.id, ...s, receivedVia: "manual", receivedByUserId: null } });
    stored++;
    if (await promoteToPersonDocument(doc.id, null)) onPerson++;
  }
  // 6. History: closed (still counts for the 2027 offer -- an accepted participation).
  await prisma.event.update({ where: { id: event.id }, data: { status: "closed" } });

  console.log(JSON.stringify({ ...report, applied: { ...applied.counts, accepted: accepted.count, peopleCreated: people.length, pdfsStored: stored, pdfsOnPerson: onPerson, pdfNotStoredFileIds: notStored }, eventId: event.id }, null, 1));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
export {};
