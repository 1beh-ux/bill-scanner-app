// Fields Manager phase 4 (design §9): the import wizard's server half, over the existing sync planner.
//   GET  -> the event's connections + recent import runs (for undo)
//   POST { action: "read", sheetId, tab? }                     -> the sheet as a table
//   POST { action: "plan" | "apply", table, settings, syncId?, markDocumentId? } -> the plan; apply also writes it (participants,
//        then profiles through writeTargets), records an ImportRun, and saves the choices on the connection.
// Flag-gated (404 while off). Redesign R1 (2026-11-23): the same people as the old import page may use it (participants
// / health / mail module of the event); fields limited to what the user may see, as there.
import { NextRequest, NextResponse } from "next/server";
import { guardianSlots } from "@/lib/org-features";
import { readGuardianSettings } from "@/lib/guardian-fields";
import { access } from "./access";
import { prisma } from "@/lib/prisma";
import { httpStatusForDriveError } from "@/lib/drive-errors";
import { extractSpreadsheetId } from "@/lib/sheet-import";
import { applyPlan, loadImportFields, loadSyncs, planFor, publicSync, readSyncSheet, updateSyncs, type Table } from "@/lib/participant-sync-run";
import { countPlan, policyOf, resultRows, sanitizeSettings } from "@/lib/participant-sync";
import { createdPeople, recordImportRun, writeProfileValues } from "@/lib/import-run";

const MAX_ROWS = 5000;
const MAX_COLS = 200;

function readTable(v: unknown): Table | null {
  if (!v || typeof v !== "object") return null;
  const { headers, rows } = v as { headers?: unknown; rows?: unknown };
  const strings = (a: unknown): a is string[] => Array.isArray(a) && a.length <= MAX_COLS && a.every((c) => typeof c === "string");
  if (!strings(headers) || !Array.isArray(rows) || rows.length > MAX_ROWS || !rows.every(strings)) return null;
  return { headers, rows };
}

/** Import fields the user may see + each one's manager section (the policy's "category"). */
async function fieldsFor(eventId: string, organizationId: string, allowed?: Set<string>) {
  const [fields, templates] = await Promise.all([
    loadImportFields(eventId, allowed),
    prisma.participantFieldTemplate.findMany({ where: { organizationId }, select: { key: true, section: true } }),
  ]);
  const section = new Map(templates.map((t) => [t.key, t.section]));
  return fields.map((f) => ({ ...f, section: section.get(f.key) ?? null }));
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const a = await access(eventId);
  if ("error" in a) return a.error;
  const [syncs, runs, fields, participants, docTypes, org] = await Promise.all([
    loadSyncs(eventId),
    prisma.importRun.findMany({ where: { eventId }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, syncId: true, createdAt: true, undoneAt: true, writes: true } }),
    fieldsFor(eventId, a.organizationId, a.allowed),
    // For "merge into": any participant of the event.
    prisma.participant.findMany({ where: { eventId }, orderBy: { name: "asc" }, select: { id: true, name: true, dateOfBirth: true } }),
    prisma.eventListItem.findMany({ where: { eventId, kind: "document", active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.organization.findUniqueOrThrow({ where: { id: a.organizationId }, select: { guardianSlots: true, guardianProps: true } }),
  ]);
  return NextResponse.json({
    syncs: syncs.map(publicSync),
    fields,
    docTypes,
    guardianSlots: guardianSlots(org.guardianSlots),
    // The organization's own guardian fields (2026-11-26): import targets guardian<N>_<key>.
    guardianFields: readGuardianSettings(org.guardianProps).fields.map((f) => ({ key: f.key, label: f.label })),
    participants: participants.map((p) => ({ id: p.id, name: p.name, dateOfBirth: p.dateOfBirth?.toISOString().slice(0, 10) ?? null })),
    runs: runs.map(({ writes, ...r }) => ({ ...r, writes: (writes as unknown[]).length })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const a = await access(eventId);
  if ("error" in a) return a.error;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.action === "read") {
    const sheetId = extractSpreadsheetId(typeof body.sheetId === "string" ? body.sheetId : "");
    if (!sheetId) return NextResponse.json({ error: "spreadsheet_id_required" }, { status: 400 });
    const sheet = await readSyncSheet(eventId, sheetId, typeof body.tab === "string" ? body.tab : undefined);
    if ("error" in sheet) return NextResponse.json({ error: sheet.error.code, ...sheet.error.params }, { status: httpStatusForDriveError(sheet.error.code) });
    return NextResponse.json(sheet);
  }
  if (body.action !== "plan" && body.action !== "apply") return NextResponse.json({ error: "invalid_action" }, { status: 400 });

  const table = readTable(body.table);
  if (!table) return NextResponse.json({ error: "invalid_table" }, { status: 400 });
  const syncId = typeof body.syncId === "string" ? body.syncId : null;
  const sync = syncId ? (await loadSyncs(eventId)).find((s) => s.id === syncId) : undefined;
  if (syncId && !sync) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const settings = sanitizeSettings((body.settings ?? {}) as object);
  const fields = await fieldsFor(eventId, a.organizationId, a.allowed);
  const plan = await planFor(eventId, table, settings, fields, sync?.seenKeys ?? []);
  const shown = plan.map((r) => ({ ...r, create: undefined, patch: undefined }));
  if (body.action === "plan") return NextResponse.json({ plan: shown, counts: countPlan(plan) });

  // "Označit dokument jako doručený" (redesign R4): a document type of this event, recorded as the user importing.
  const docTypeId = typeof body.markDocumentId === "string" && body.markDocumentId ? body.markDocumentId : null;
  const markDocument = docTypeId && (await prisma.eventListItem.findFirst({ where: { id: docTypeId, eventId, kind: "document" }, select: { id: true } })) ? { docTypeId, userId: a.userId } : undefined;
  const started = new Date();
  const applied = await applyPlan(eventId, plan, markDocument);
  const profileWrites = await writeProfileValues(a.organizationId, applied.writes, policyOf(settings));
  const people = await createdPeople(applied.writes, started);
  const run = await recordImportRun(eventId, syncId, a.userId, [...applied.writes, ...people, ...profileWrites]);
  if (sync) {
    // The choices made here are remembered for the next run of this connection (old keys kept as they were).
    await updateSyncs(eventId, (list) =>
      list.map((s) =>
        s.id !== sync.id
          ? s
          : { ...s, ...settings, seenKeys: [...new Set([...s.seenKeys, ...applied.seen])], lastSync: { at: started.toISOString(), auto: false, counts: applied.counts, issues: [] } },
      ),
    );
  }
  return NextResponse.json({
    runId: run.id,
    counts: { ...applied.counts, profileValues: profileWrites.length },
    rows: resultRows(plan, applied.failedRows),
  });
}
