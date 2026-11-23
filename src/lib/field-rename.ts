// Renaming a field key (Fields Manager phase 3b, design §6a): the organization template AND every event copy, the
// stored values (profiles + registrations), calculated parts, the app's own saved settings (list columns, layouts,
// health notes, exports, sync mappings) -- all in one transaction, logged for undo. Google Docs and e-mail
// templates can't be edited atomically, so the old key stays an alias for them (one hop, design §6).
import type { Prisma, PrismaClient } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { BUILTIN_EVENT_KEYS, EVENT_VARIABLE_ALIASES } from "@/lib/event-variables";
import { parseGuardianKey } from "@/lib/field-resolver";
import { readSyncs } from "@/lib/participant-sync";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
export const FIELD_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,59}$/;

/** Replaces every string (and object key) equal to `from` or "f:"+from in a JSON value. Pure; returns [value, hits]. */
export function swapKey(value: unknown, from: string, to: string): [unknown, number] {
  let hits = 0;
  const s = (x: string) => (x === from ? (hits++, to) : x === `f:${from}` ? (hits++, `f:${to}`) : x);
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return s(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [s(k), walk(x)]));
    return v;
  };
  return [walk(value), hits];
}

/** A values map with `from` moved to `to`, or null when it has no `from`. The renamed field's value wins over a
 * stray value already under `to` (no field owned that key -- renameBlocker checked). Pure. */
export function moveValue(map: Record<string, unknown> | null, from: string, to: string): Record<string, unknown> | null {
  if (!map || !(from in map)) return null;
  const { [from]: v, ...rest } = map;
  return { ...rest, [to]: v };
}

export const CONFIG_FIELDS = ["participantsListColumns", "documentsListColumns", "healthListColumns", "exportColumns", "participantLayout", "healthNotes"] as const;
export const CONFIG_SELECT = { participantsListColumns: true, documentsListColumns: true, healthListColumns: true, exportColumns: true, participantLayout: true, healthNotes: true, participantSyncs: true } as const;

/** Why `to` can't be used, or null. */
export async function renameBlocker(db: Tx, organizationId: string, from: string, to: string): Promise<string | null> {
  if (!FIELD_KEY.test(to)) return "invalid_key";
  if (to === from) return "same_key";
  if (BUILTIN_EVENT_KEYS.has(to) || to in EVENT_VARIABLE_ALIASES || parseGuardianKey(to, 9)) return "key_taken";
  const [tpl, ev, alias, variable] = await Promise.all([
    db.participantFieldTemplate.findFirst({ where: { organizationId, key: to }, select: { id: true } }),
    db.eventParticipantField.findFirst({ where: { key: to, event: { organizationId } }, select: { id: true } }),
    db.fieldAlias.findFirst({ where: { organizationId, alias: to }, select: { id: true } }),
    db.eventVariable.findFirst({ where: { organizationId, key: to }, select: { id: true } }),
  ]);
  return tpl || ev || alias || variable ? "key_taken" : null;
}

/** What a rename would touch (counts only) -- shown in the confirmation dialog. */
export async function renamePreview(organizationId: string, from: string, to: string) {
  const blocker = await renameBlocker(prisma, organizationId, from, to);
  const [template, copies, children, participants, events, calcs] = await Promise.all([
    prisma.participantFieldTemplate.findFirst({ where: { organizationId, key: from }, select: { id: true } }),
    prisma.eventParticipantField.findMany({ where: { key: from, event: { organizationId } }, select: { eventId: true, kind: true } }),
    prisma.child.findMany({ where: { organizationId }, select: { fieldValues: true } }),
    prisma.participant.findMany({ where: { event: { organizationId } }, select: { customFieldValues: true } }),
    prisma.event.findMany({ where: { organizationId }, select: CONFIG_SELECT }),
    prisma.eventParticipantField.findMany({ where: { event: { organizationId }, fieldType: { in: ["composite", "calculated"] } }, select: { options: true } }),
  ]);
  const has = (m: unknown) => !!m && typeof m === "object" && from in (m as object);
  const configHits = events.reduce((n, e) => n + CONFIG_FIELDS.reduce((k, c) => k + swapKey((e as Record<string, unknown>)[c], from, to)[1], 0), 0);
  const syncHits = events.reduce((n, e) => n + readSyncs(e.participantSyncs).reduce((k, s) => k + Object.values(s.mapping).filter((v) => v === from).length + (s.matchBy === from ? 1 : 0), 0), 0);
  return {
    blocker: blocker ?? (!template && !copies.length ? "not_found" : null),
    fixed: copies.some((c) => c.kind !== "custom"),
    template: !!template,
    events: new Set(copies.map((c) => c.eventId)).size,
    profiles: children.filter((c) => has(c.fieldValues)).length,
    registrations: participants.filter((p) => has(p.customFieldValues)).length,
    calculated: calcs.filter((c) => swapKey(c.options, from, to)[1] > 0).length,
    settings: configHits,
    syncMappings: syncHits,
  };
}

/** The rename itself. alias=false only for undo (renaming back must not leave an alias behind). */
export async function applyRename(organizationId: string, userId: string | null, from: string, to: string, opts: { alias: boolean; logId?: string } = { alias: true }) {
  return prisma.$transaction(
    async (tx) => {
      const blocker = await renameBlocker(tx, organizationId, from, to);
      // Undo renames back onto the key that is (still) the alias: that alias is removed first, so it's not "taken".
      if (blocker && !(blocker === "key_taken" && !opts.alias && (await tx.fieldAlias.findFirst({ where: { organizationId, alias: to } })))) throw new Error(blocker);
      if (!opts.alias) await tx.fieldAlias.deleteMany({ where: { organizationId, alias: to } });
      const copies = await tx.eventParticipantField.findMany({ where: { key: from, event: { organizationId } }, select: { id: true, kind: true } });
      if (copies.some((c) => c.kind !== "custom")) throw new Error("fixed_field");
      if (!copies.length && !(await tx.participantFieldTemplate.findFirst({ where: { organizationId, key: from }, select: { id: true } }))) throw new Error("not_found");

      await tx.participantFieldTemplate.updateMany({ where: { organizationId, key: from }, data: { key: to } });
      await tx.eventParticipantField.updateMany({ where: { key: from, event: { organizationId } }, data: { key: to } });
      for (const c of await tx.eventParticipantField.findMany({ where: { event: { organizationId }, fieldType: { in: ["composite", "calculated"] } }, select: { id: true, options: true } })) {
        const [options, hits] = swapKey(c.options, from, to);
        if (hits) await tx.eventParticipantField.update({ where: { id: c.id }, data: { options: options as Prisma.InputJsonValue } });
      }
      for (const c of await tx.participantFieldTemplate.findMany({ where: { organizationId, fieldType: { in: ["composite", "calculated"] } }, select: { id: true, options: true } })) {
        const [options, hits] = swapKey(c.options, from, to);
        if (hits) await tx.participantFieldTemplate.update({ where: { id: c.id }, data: { options: options as Prisma.InputJsonValue } });
      }
      let values = 0;
      for (const c of await tx.child.findMany({ where: { organizationId }, select: { id: true, fieldValues: true } })) {
        const next = moveValue(c.fieldValues as Record<string, unknown> | null, from, to);
        if (!next) continue;
        values++;
        await tx.child.update({ where: { id: c.id }, data: { fieldValues: next as Prisma.InputJsonValue } });
      }
      for (const p of await tx.participant.findMany({ where: { event: { organizationId } }, select: { id: true, customFieldValues: true } })) {
        const next = moveValue(p.customFieldValues as Record<string, unknown> | null, from, to);
        if (!next) continue;
        values++;
        await tx.participant.update({ where: { id: p.id }, data: { customFieldValues: next as Prisma.InputJsonValue } });
      }
      for (const e of await tx.event.findMany({ where: { organizationId }, select: { id: true, ...CONFIG_SELECT } })) {
        const data: Record<string, unknown> = {};
        for (const c of CONFIG_FIELDS) {
          const [v, hits] = swapKey((e as Record<string, unknown>)[c], from, to);
          if (hits) data[c] = v;
        }
        const syncs = readSyncs(e.participantSyncs);
        if (syncs.some((s) => s.matchBy === from || Object.values(s.mapping).includes(from))) {
          data.participantSyncs = syncs.map((s) => ({ ...s, matchBy: s.matchBy === from ? to : s.matchBy, mapping: Object.fromEntries(Object.entries(s.mapping).map(([h, k]) => [h, k === from ? to : k])) }));
        }
        if (Object.keys(data).length) await tx.event.update({ where: { id: e.id }, data: data as Prisma.EventUpdateInput });
      }
      const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { exportColumns: true } });
      const [orgExport, orgHits] = swapKey(org.exportColumns, from, to);
      if (orgHits) await tx.organization.update({ where: { id: organizationId }, data: { exportColumns: orgExport as Prisma.InputJsonValue } });
      // Aliases: repoint ones that pointed at `from` (one hop stays one hop), then the old key itself.
      await tx.fieldAlias.updateMany({ where: { organizationId, targetKey: from }, data: { targetKey: to } });
      if (opts.alias) await tx.fieldAlias.create({ data: { organizationId, alias: from, targetKind: "field", targetKey: to, reason: "rename", createdById: userId } });
      if (opts.logId) await tx.fieldChangeLog.update({ where: { id: opts.logId }, data: { undoneAt: new Date() } });
      return tx.fieldChangeLog.create({ data: { organizationId, action: opts.logId ? "rename_undo" : "rename", byId: userId, before: { key: from }, after: { key: to, alias: opts.alias, values, events: copies.length } } });
    },
    { timeout: 60_000 },
  );
}
