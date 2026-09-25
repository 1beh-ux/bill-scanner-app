// Participant sync -- the server half: stored connections (Event.participantSyncs),
// reading the sheet, planning (participant-sync.ts) and applying the plan.
// Used by the import page's routes and the hourly cron (auto sync).

import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { toDriveError } from "@/lib/drive";
import type { DriveErrorCode } from "@/lib/drive-errors";
import { readSheetTable } from "@/lib/sheet-import";
import {
  MATCH_BY_NAME,
  REGNUM_TARGET,
  countPlan,
  planSync,
  readSyncs,
  type ExistingParticipant,
  type FieldInfo,
  type ParticipantSync,
  type PlanRow,
  type SyncRunSummary,
  type SyncSettings,
} from "@/lib/participant-sync";

const RUN_LOCK_MS = 10 * 60 * 1000;

/** Read-modify-write of the connection list under a row lock (the cron and users write the same JSON). */
export async function updateSyncs(eventId: string, fn: (list: ParticipantSync[]) => ParticipantSync[]): Promise<ParticipantSync[]> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId} FOR UPDATE`;
    const e = await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { participantSyncs: true } });
    const next = fn(readSyncs(e.participantSyncs));
    await tx.event.update({ where: { id: eventId }, data: { participantSyncs: next as unknown as Prisma.InputJsonValue } });
    return next;
  });
}

/** The event's connections; the old single saved sheet becomes the first one on first read. */
export async function loadSyncs(eventId: string): Promise<ParticipantSync[]> {
  const e = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { participantSyncs: true, participantsSheetId: true, participantsColumnMapping: true },
  });
  if (e.participantSyncs !== null || !e.participantsSheetId) return readSyncs(e.participantSyncs);
  const oldMapping = (e.participantsColumnMapping ?? {}) as Record<string, unknown>;
  const legacy: ParticipantSync = {
    id: randomUUID(),
    name: "Přihláška",
    sheetId: e.participantsSheetId,
    mapping: Object.fromEntries(Object.entries(oldMapping).filter((kv): kv is [string, string] => typeof kv[1] === "string" && kv[1] !== "ignore")),
    matchBy: MATCH_BY_NAME,
    onNew: "create",
    onMatch: "fill",
    overrides: {},
    excluded: [],
    autoSync: false,
    everyHours: 6,
    seenKeys: [],
  };
  return updateSyncs(eventId, (list) => (list.length > 0 ? list : [legacy]));
}

/** Importable fields (the `import` surface); `allowed` limits them to what the user may see. */
export async function loadImportFields(eventId: string, allowed?: Set<string>): Promise<FieldInfo[]> {
  const fields = await prisma.eventParticipantField.findMany({
    where: { eventId, active: true, surfaces: { has: "import" } },
    select: { key: true, label: true, kind: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return fields.filter((f) => !allowed || allowed.has(f.key));
}

/** Drops mapping targets / match key the fields list doesn't offer (untrusted input, or a field removed since). */
export function restrictSettings(s: SyncSettings, fields: FieldInfo[]): SyncSettings {
  const keys = new Set([...fields.map((f) => f.key), REGNUM_TARGET]);
  const custom = new Set(fields.filter((f) => f.kind === "custom").map((f) => f.key));
  return {
    ...s,
    mapping: Object.fromEntries(Object.entries(s.mapping).filter(([, v]) => keys.has(v))),
    matchBy: s.matchBy === MATCH_BY_NAME || s.matchBy === REGNUM_TARGET || custom.has(s.matchBy) ? s.matchBy : MATCH_BY_NAME,
  };
}

async function loadExisting(eventId: string): Promise<ExistingParticipant[]> {
  const ps = await prisma.participant.findMany({ where: { eventId }, include: { guardians: true } });
  return ps.map((p) => ({
    id: p.id,
    name: p.name,
    firstName: p.firstName,
    lastName: p.lastName,
    groupName: p.groupName,
    dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : null,
    registrationNumber: p.registrationNumber,
    customFieldValues: (p.customFieldValues as Record<string, string> | null) ?? {},
    guardians: p.guardians.map((g) => ({ id: g.id, email: g.email, name: g.name, phone: g.phone, relationship: g.relationship })),
  }));
}

export type Table = { headers: string[]; rows: string[][] };
export type SheetRead = Table & { tabs: string[]; tab: string };
export type DriveFailure = { code: DriveErrorCode; params?: Record<string, string> };

export async function readSyncSheet(eventId: string, sheetId: string, tab?: string): Promise<SheetRead | { error: DriveFailure }> {
  try {
    return await readSheetTable(eventId, sheetId, tab);
  } catch (err) {
    const e = await toDriveError(eventId, err, { purpose: "read" });
    return { error: { code: e.code, params: e.params as Record<string, string> } };
  }
}

export async function planFor(eventId: string, table: Table, settings: SyncSettings, fields: FieldInfo[], seenKeys: string[]): Promise<PlanRow[]> {
  return planSync({ headers: table.headers, rows: table.rows, settings: restrictSettings(settings, fields), fields, existing: await loadExisting(eventId), seenKeys });
}

const nullIfEmpty = (s: string | undefined) => s?.trim() || null;

/** Writes the plan's create/update rows. Returns counts and the keys now known to exist. */
export async function applyPlan(eventId: string, plan: PlanRow[]): Promise<{ counts: Record<string, number>; seen: string[]; failedRows: number[] }> {
  const counts = countPlan(plan);
  const seen: string[] = [];
  const failedRows: number[] = [];
  for (const r of plan) {
    try {
      if (r.status === "create" && r.create) {
        const c = r.create;
        await prisma.participant.create({
          data: {
            eventId,
            name: c.name,
            firstName: nullIfEmpty(c.firstName),
            lastName: nullIfEmpty(c.lastName),
            groupName: nullIfEmpty(c.groupName),
            dateOfBirth: c.dateOfBirthIso ? new Date(c.dateOfBirthIso) : null,
            customFieldValues: c.customFieldValues,
            guardians: {
              create: c.guardians.map((g) => ({ email: g.email.trim(), name: nullIfEmpty(g.name), phone: nullIfEmpty(g.phone), relationship: nullIfEmpty(g.relationship) })),
            },
          },
        });
      } else if (r.status === "update" && r.patch && r.participant) {
        const { patch } = r;
        const id = r.participant.id;
        await prisma.$transaction(async (tx) => {
          // Custom values merged into the CURRENT ones (not the ones read when planning).
          const now = await tx.participant.findUniqueOrThrow({ where: { id }, select: { customFieldValues: true } });
          await tx.participant.update({
            where: { id },
            data: {
              ...(patch.name !== undefined && { name: patch.name, firstName: patch.firstName ?? null, lastName: patch.lastName ?? null }),
              ...(patch.groupName !== undefined && { groupName: patch.groupName }),
              ...(patch.dateOfBirth !== undefined && { dateOfBirth: new Date(patch.dateOfBirth) }),
              ...(patch.customFieldValues && {
                customFieldValues: { ...((now.customFieldValues as Record<string, string> | null) ?? {}), ...patch.customFieldValues },
              }),
            },
          });
          for (const g of patch.guardiansAdd) {
            await tx.participantGuardian.create({
              data: { participantId: id, email: g.email.trim(), name: nullIfEmpty(g.name), phone: nullIfEmpty(g.phone), relationship: nullIfEmpty(g.relationship) },
            });
          }
          for (const { id: guardianId, ...data } of patch.guardiansUpdate) {
            await tx.participantGuardian.update({ where: { id: guardianId }, data });
          }
        });
      }
      if (r.matchKey && ["create", "update", "same", "skip"].includes(r.status)) seen.push(r.matchKey);
    } catch (err) {
      console.error(`participant sync row ${r.rowNumber} failed`, err);
      counts[r.status] -= 1;
      counts.failed = (counts.failed ?? 0) + 1;
      failedRows.push(r.rowNumber);
    }
  }
  return { counts, seen, failedRows };
}

const ISSUE_STATUSES = new Set(["unmatched", "seen_missing", "error"]);

/**
 * Runs a saved connection for real: reads the sheet, applies the plan, stores
 * seen keys + the run summary. One run per connection at a time (a lock in
 * the connection itself, expiring after 10 min in case a run died).
 */
export async function runSavedSync(eventId: string, syncId: string, auto: boolean): Promise<SyncRunSummary | { error: "not_found" | "already_running" }> {
  let sync: ParticipantSync | undefined;
  let busy = false;
  await updateSyncs(eventId, (list) =>
    list.map((s) => {
      if (s.id !== syncId) return s;
      busy = !!s.runningSince && Date.now() - Date.parse(s.runningSince) < RUN_LOCK_MS;
      sync = s;
      return busy ? s : { ...s, runningSince: new Date().toISOString() };
    })
  );
  if (!sync) return { error: "not_found" };
  if (busy) return { error: "already_running" };

  const summary: SyncRunSummary = { at: new Date().toISOString(), auto, counts: {}, issues: [] };
  let seen: string[] = [];
  try {
    const sheet = await readSyncSheet(eventId, sync.sheetId, sync.tab);
    if ("error" in sheet) summary.error = sheet.error;
    else {
      const plan = await planFor(eventId, sheet, sync, await loadImportFields(eventId), sync.seenKeys);
      const applied = await applyPlan(eventId, plan);
      summary.counts = applied.counts;
      seen = applied.seen;
      const failed = new Set(applied.failedRows);
      summary.issues = plan
        .filter((r) => ISSUE_STATUSES.has(r.status) || failed.has(r.rowNumber))
        .slice(0, 200)
        .map((r) => ({ row: r.rowNumber, status: failed.has(r.rowNumber) ? "failed" : r.status, code: r.errors[0], key: r.matchKey ?? undefined }));
    }
  } finally {
    await updateSyncs(eventId, (list) =>
      list.map((s) => {
        if (s.id !== syncId) return s;
        return { ...s, runningSince: undefined, seenKeys: [...new Set([...s.seenKeys, ...seen])], lastSync: summary };
      })
    );
  }
  return summary;
}

/** Cron: every due auto-sync connection of every open event. */
export async function runDueSyncs(): Promise<{ ran: number; failed: number }> {
  const events = await prisma.event.findMany({
    where: { status: "active", participantSyncs: { not: Prisma.AnyNull } },
    select: { id: true, participantSyncs: true },
  });
  let ran = 0;
  let failed = 0;
  for (const e of events) {
    for (const s of readSyncs(e.participantSyncs)) {
      // 5 min slack so an hourly job doesn't skip a run over a few seconds of jitter.
      const due = !s.lastSync || Date.now() - Date.parse(s.lastSync.at) >= s.everyHours * 3600_000 - 5 * 60_000;
      if (!s.autoSync || !s.sheetId || !due) continue;
      const result = await runSavedSync(e.id, s.id, true).catch((err) => {
        console.error(`participant auto sync ${e.id}/${s.id} failed`, err);
        return null;
      });
      if (result && !("error" in result && typeof result.error === "string")) ran++;
      else failed++;
    }
  }
  return { ran, failed };
}

/** What the page gets: seen keys stay server-side, only how many there are. */
export function publicSync({ seenKeys, ...s }: ParticipantSync) {
  return { ...s, seenCount: seenKeys.length };
}
export type PublicSync = ReturnType<typeof publicSync>;
