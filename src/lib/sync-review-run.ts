// Fields Manager phase 5 (design §10): the review queue's server half -- storing items from an automatic run, and
// resolving one (apply once / always / dismiss). Every write goes through the same planner + applyPlan +
// writeTargets path as an import and is recorded in ImportRun (undoable).
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { applyPlan, loadImportFields, loadSyncs, planFor, updateSyncs } from "@/lib/participant-sync-run";
import { policyOf, type ImportPolicy, type ParticipantSync, type SyncSettings } from "@/lib/participant-sync";
import { createdPeople, recordImportRun, writeProfileValues } from "@/lib/import-run";
import { samePayload, type ReviewItemIn } from "@/lib/sync-review";

/**
 * Upserts a run's items by (event, connection, row, kind): an open item gets the new content, a resolved one opens
 * again only when its content changed (a dismissed difference that comes back the same stays dismissed). Open items
 * the run didn't produce any more (fixed in the table or in the app) are closed as "gone".
 */
export async function queueItems(eventId: string, syncId: string, items: ReviewItemIn[]): Promise<{ queued: number }> {
  const existing = await prisma.syncReviewItem.findMany({ where: { eventId, syncId } });
  const byKey = new Map(existing.map((x) => [`${x.rowKey}|${x.kind}`, x]));
  let queued = 0;
  for (const it of items) {
    const old = byKey.get(`${it.rowKey}|${it.kind}`);
    byKey.delete(`${it.rowKey}|${it.kind}`);
    const payload = it.payload as Prisma.InputJsonValue;
    if (!old) {
      await prisma.syncReviewItem.create({ data: { eventId, syncId, rowKey: it.rowKey, kind: it.kind, payload } });
      queued++;
    } else if (old.status === "pending" || !samePayload(old.payload, it.payload)) {
      if (old.status !== "pending") queued++;
      await prisma.syncReviewItem.update({ where: { id: old.id }, data: { payload, status: "pending", resolvedAt: null, resolvedById: null } });
    }
  }
  const gone = [...byKey.values()].filter((x) => x.status === "pending").map((x) => x.id);
  if (gone.length) await prisma.syncReviewItem.updateMany({ where: { id: { in: gone } }, data: { status: "gone", resolvedAt: new Date() } });
  return { queued };
}

export const pendingCount = (eventId: string) => prisma.syncReviewItem.count({ where: { eventId, status: "pending" } });

type Payload = { rowNumber: number; headers: string[]; cells: string[]; participantId?: string | null; changes?: { field: string }[]; values?: { field: string; value: string }[] };
export type Resolution = { action: "apply" | "dismiss"; choice?: string; values?: Record<string, string>; always?: boolean };

/** The settings change a resolution means (merge into / cell rule / value translation). Pure. */
export function resolutionPatch(sync: SyncSettings, kind: string, p: Payload, rowKey: string, r: Resolution): Partial<SyncSettings> | null {
  const policy: ImportPolicy = policyOf(sync);
  if (kind === "possible_match" || kind === "unmatched") {
    if (!r.choice) return null;
    return { mergeInto: { ...sync.mergeInto, [rowKey]: r.choice } }; // a participant id, or NEW_PERSON
  }
  if (kind === "difference" && p.participantId) {
    const cells = Object.fromEntries((p.changes ?? []).map((c) => [c.field, "replace" as const]));
    return { policy: { ...policy, byCell: { ...policy.byCell, [p.participantId]: { ...policy.byCell?.[p.participantId], ...cells } } } };
  }
  if (kind === "bad_value" && r.values) {
    const valueMap = { ...sync.valueMap };
    for (const { field, value } of p.values ?? []) {
      const to = r.values[value];
      if (!to) continue;
      // The value came from the column(s) mapped to the field.
      for (const [header, target] of Object.entries(sync.mapping)) if (target === field) valueMap[header] = { ...valueMap[header], [value]: to };
    }
    return { valueMap };
  }
  return null;
}

export async function resolveItem(eventId: string, organizationId: string, itemId: string, userId: string, r: Resolution) {
  const item = await prisma.syncReviewItem.findFirst({ where: { id: itemId, eventId } });
  if (!item) return { error: "not_found" as const };
  if (item.status !== "pending") return { error: "already_resolved" as const };
  if (r.action === "dismiss") {
    await prisma.syncReviewItem.update({ where: { id: itemId }, data: { status: "dismissed", resolvedById: userId, resolvedAt: new Date() } });
    return { ok: true };
  }
  const sync = (await loadSyncs(eventId)).find((s) => s.id === item.syncId);
  if (!sync) return { error: "not_found" as const };
  const p = item.payload as Payload;
  const patch = resolutionPatch(sync, item.kind, p, item.rowKey, r);
  if (!patch) return { error: "invalid" as const };
  // A merge / "new person" must hold for the next runs too, or the row would come back; the rest only if asked.
  const keep = r.always || item.kind === "possible_match" || item.kind === "unmatched";
  // The row alone, at its own row number (empty rows above are skipped), so its row key is the same as in the run.
  const table = { headers: p.headers, rows: [...Array.from({ length: p.rowNumber - 2 }, () => []), p.cells] };
  const settings: ParticipantSync = { ...sync, ...patch };
  const plan = (await planFor(eventId, table, settings, await loadImportFields(eventId), sync.seenKeys)).filter((x) => x.rowKey === item.rowKey);
  const started = new Date();
  const applied = await applyPlan(eventId, plan);
  const profile = await writeProfileValues(organizationId, applied.writes, policyOf(settings));
  const run = await recordImportRun(eventId, sync.id, userId, [...applied.writes, ...(await createdPeople(applied.writes, started)), ...profile]);
  await updateSyncs(eventId, (list) => list.map((s) => (s.id !== sync.id ? s : { ...s, ...(keep ? patch : {}), seenKeys: [...new Set([...s.seenKeys, ...applied.seen])] })));
  await prisma.syncReviewItem.update({ where: { id: itemId }, data: { status: "applied", resolvedById: userId, resolvedAt: new Date() } });
  return { ok: true, runId: run.id, counts: applied.counts };
}
