// Fields Manager phase 7 (design §12) -- the only phase that changes existing data. Merge a group of duplicate
// fields into one target, turn a field into a calculated one, delete merged (inactive) fields. Every action runs in
// one transaction and stores everything it changed in FieldChangeLog, so it can be undone exactly; a value changed
// after the action is never overwritten by the undo (it is left and counted).
//
// Merging never deletes a value: old keys keep their values in the JSON (just no longer asked or shown), the target
// gets the old value where it is empty, and where both differ the target stays and the old value is listed.
// The app's own saved settings (columns, layouts, health notes, export, kitchen allergy setting, sync mappings) are
// pointed at the target in both modes -- otherwise they would read / write an inactive field. "direct" additionally
// queues Google Docs edits ({{old}} -> {{target}}); "alias" leaves the Docs on the old names (they keep working).
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { CONFIG_FIELDS, CONFIG_SELECT, swapKey } from "@/lib/field-rename";
import { readSyncs } from "@/lib/participant-sync";
import { restoreKey } from "@/lib/import-run";
import { invalidateResolverContext } from "@/lib/field-resolver";

type Values = Record<string, unknown>;
const filled = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";
const TEXTY = new Set(["text", "longtext"]);

/** One value map: the target takes the first filled old value when empty; differing filled old values are conflicts. Pure. */
export function mergeMap(map: Values | null, oldKeys: string[], target: string): { next: Values | null; conflicts: { key: string; value: unknown }[] } {
  if (!map) return { next: null, conflicts: [] };
  let t = map[target];
  let moved = false;
  const conflicts: { key: string; value: unknown }[] = [];
  for (const k of oldKeys) {
    const v = map[k];
    if (!filled(v)) continue;
    if (!filled(t)) {
      t = v;
      moved = true;
    } else if (String(v).trim() !== String(t).trim()) conflicts.push({ key: k, value: v });
  }
  return { next: moved ? { ...map, [target]: t } : null, conflicts };
}

/** Field types that can be merged: the same type, or text into long text and back. Pure. */
export const typesCompatible = (a: string, b: string) => a === b || (TEXTY.has(a) && TEXTY.has(b));

/** Code that reads a key directly (findings §5): merging such a key away needs the target to be that key. */
export const CODE_READERS: Record<string, string[]> = {
  allergies: ["health_pdf", "kitchen"],
  alergie: ["kitchen"],
  chronicIssues: ["health_pdf"],
  medsNotes: ["health_pdf", "health_detail"],
  otherNotes: ["health_pdf"],
  adresa_ulice_cp: ["adults_travel"],
  adresa_mesto: ["adults_travel"],
  adresa_psc: ["adults_travel"],
};

/** The agreed groups (Q answers): suggested when the organization has at least two of the keys. */
export const SUGGESTED_GROUPS: { id: string; keys: string[]; target: string }[] = [
  { id: "allergies", keys: ["allergies", "alergie", "alergie_projevy"], target: "allergies" },
  { id: "chronic", keys: ["chronicIssues", "chronicka_onemocneni"], target: "chronicIssues" },
  { id: "meds", keys: ["medsNotes", "pravidelne_leky"], target: "medsNotes" },
];

type FieldRow = { table: "template" | "event"; id: string; key: string; active: boolean };
type ValueWrite = { table: "child" | "participant"; id: string; key: string; before: unknown; after: unknown };
type ConfigWrite = { eventId: string; field: string; before: unknown; after: unknown };
type SyncWrite = { eventId: string; syncId: string; header?: string; matchBy?: boolean; from: string };
type MergeBefore = { fields: FieldRow[]; values: ValueWrite[]; configs: ConfigWrite[]; orgExport?: { before: unknown; after: unknown }; kitchen: { id: string; from: string }[]; syncs: SyncWrite[]; aliasesRepointed: { id: string; from: string }[] };
type MergeAfter = { target: string; oldKeys: string[]; mode: "alias" | "direct"; moved: number; conflicts: { table: string; id: string; key: string; value: unknown }[]; aliasIds: string[]; docEditIds: string[] };

async function fieldsOf(organizationId: string, keys: string[]) {
  const [templates, copies] = await Promise.all([
    prisma.participantFieldTemplate.findMany({ where: { organizationId, key: { in: keys } }, select: { id: true, key: true, active: true, fieldType: true } }),
    prisma.eventParticipantField.findMany({ where: { key: { in: keys }, event: { organizationId } }, select: { id: true, key: true, active: true, fieldType: true, kind: true } }),
  ]);
  return { templates, copies };
}

/** Why the group can't be merged, or null. */
export async function mergeBlocker(organizationId: string, target: string, oldKeys: string[]): Promise<string | null> {
  if (!oldKeys.length || oldKeys.includes(target) || new Set(oldKeys).size !== oldKeys.length) return "invalid";
  const { templates, copies } = await fieldsOf(organizationId, [target, ...oldKeys]);
  const typeOf = (k: string) => templates.find((t) => t.key === k)?.fieldType ?? copies.find((c) => c.key === k)?.fieldType;
  if (!typeOf(target)) return "not_found";
  for (const k of oldKeys) {
    const ty = typeOf(k);
    if (!ty) return "not_found";
    if (copies.some((c) => c.key === k && c.kind !== "custom")) return "fixed_field";
    if (ty === "calculated" || ty === "composite" || !typesCompatible(ty, typeOf(target)!)) return "type_mismatch";
  }
  return null;
}

/** What a merge would do (counts only) -- the confirmation screen. */
export async function mergePreview(organizationId: string, target: string, oldKeys: string[]) {
  const blocker = await mergeBlocker(organizationId, target, oldKeys);
  const [children, participants, events] = await Promise.all([
    prisma.child.findMany({ where: { organizationId }, select: { fieldValues: true } }),
    prisma.participant.findMany({ where: { event: { organizationId } }, select: { customFieldValues: true } }),
    prisma.event.findMany({ where: { organizationId }, select: CONFIG_SELECT }),
  ]);
  const count = (rows: (Values | null)[]) => {
    const n = { moved: 0, conflicts: 0 };
    for (const m of rows) {
      const r = mergeMap(m, oldKeys, target);
      n.moved += r.next ? 1 : 0;
      n.conflicts += r.conflicts.length;
    }
    return n;
  };
  const p = count(children.map((c) => c.fieldValues as Values | null));
  const r = count(participants.map((x) => x.customFieldValues as Values | null));
  const settings = events.reduce((n, e) => n + oldKeys.reduce((k, o) => k + CONFIG_FIELDS.reduce((j, c) => j + swapKey((e as Record<string, unknown>)[c], o, target)[1], 0), 0), 0);
  const syncs = events.reduce((n, e) => n + readSyncs(e.participantSyncs).reduce((k, s) => k + Object.values(s.mapping).filter((v) => oldKeys.includes(v)).length + (oldKeys.includes(s.matchBy) ? 1 : 0), 0), 0);
  return {
    blocker,
    profilesMoved: p.moved,
    registrationsMoved: r.moved,
    conflicts: p.conflicts + r.conflicts,
    settings,
    syncs,
    codeReaders: oldKeys.filter((k) => CODE_READERS[k]).map((k) => ({ key: k, readers: CODE_READERS[k] })),
  };
}

export async function applyMerge(organizationId: string, userId: string | null, target: string, oldKeys: string[], mode: "alias" | "direct") {
  const blocker = await mergeBlocker(organizationId, target, oldKeys);
  if (blocker) throw new Error(blocker);
  const log = await prisma.$transaction(
    async (tx) => {
      const before: MergeBefore = { fields: [], values: [], configs: [], kitchen: [], syncs: [], aliasesRepointed: [] };
      const after: MergeAfter = { target, oldKeys, mode, moved: 0, conflicts: [], aliasIds: [], docEditIds: [] };

      // 1) Values: profiles and registrations.
      for (const c of await tx.child.findMany({ where: { organizationId }, select: { id: true, fieldValues: true } })) {
        const r = mergeMap(c.fieldValues as Values | null, oldKeys, target);
        for (const x of r.conflicts) after.conflicts.push({ table: "child", id: c.id, key: x.key, value: x.value });
        if (!r.next) continue;
        before.values.push({ table: "child", id: c.id, key: target, before: (c.fieldValues as Values)[target] ?? null, after: r.next[target] });
        await tx.child.update({ where: { id: c.id }, data: { fieldValues: r.next as Prisma.InputJsonValue } });
      }
      for (const p of await tx.participant.findMany({ where: { event: { organizationId } }, select: { id: true, customFieldValues: true } })) {
        const r = mergeMap(p.customFieldValues as Values | null, oldKeys, target);
        for (const x of r.conflicts) after.conflicts.push({ table: "participant", id: p.id, key: x.key, value: x.value });
        if (!r.next) continue;
        before.values.push({ table: "participant", id: p.id, key: target, before: (p.customFieldValues as Values)[target] ?? null, after: r.next[target] });
        await tx.participant.update({ where: { id: p.id }, data: { customFieldValues: r.next as Prisma.InputJsonValue } });
      }
      after.moved = before.values.length;

      // 2) The old fields stop being asked / shown (not deleted).
      const { templates, copies } = await fieldsOf(organizationId, oldKeys);
      before.fields = [...templates.map((t) => ({ table: "template" as const, id: t.id, key: t.key, active: t.active })), ...copies.map((c) => ({ table: "event" as const, id: c.id, key: c.key, active: c.active }))];
      await tx.participantFieldTemplate.updateMany({ where: { id: { in: templates.map((t) => t.id) } }, data: { active: false } });
      await tx.eventParticipantField.updateMany({ where: { id: { in: copies.map((c) => c.id) } }, data: { active: false } });

      // 3) The app's own settings and sync mappings point at the target.
      for (const e of await tx.event.findMany({ where: { organizationId }, select: { id: true, ...CONFIG_SELECT } })) {
        const data: Record<string, unknown> = {};
        for (const c of CONFIG_FIELDS) {
          let v: unknown = (e as Record<string, unknown>)[c];
          let hits = 0;
          for (const o of oldKeys) {
            const [nv, h] = swapKey(v, o, target);
            v = nv;
            hits += h;
          }
          if (hits) {
            data[c] = v;
            before.configs.push({ eventId: e.id, field: c, before: (e as Record<string, unknown>)[c], after: v });
          }
        }
        const syncs = readSyncs(e.participantSyncs);
        if (syncs.some((s) => oldKeys.includes(s.matchBy) || Object.values(s.mapping).some((v) => oldKeys.includes(v)))) {
          data.participantSyncs = syncs.map((s) => {
            for (const [h, k] of Object.entries(s.mapping)) if (oldKeys.includes(k)) before.syncs.push({ eventId: e.id, syncId: s.id, header: h, from: k });
            if (oldKeys.includes(s.matchBy)) before.syncs.push({ eventId: e.id, syncId: s.id, matchBy: true, from: s.matchBy });
            return { ...s, matchBy: oldKeys.includes(s.matchBy) ? target : s.matchBy, mapping: Object.fromEntries(Object.entries(s.mapping).map(([h, k]) => [h, oldKeys.includes(k) ? target : k])) };
          });
        }
        if (Object.keys(data).length) await tx.event.update({ where: { id: e.id }, data: data as Prisma.EventUpdateInput });
      }
      const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { exportColumns: true } });
      let ex: unknown = org.exportColumns;
      let exHits = 0;
      for (const o of oldKeys) {
        const [nv, h] = swapKey(ex, o, target);
        ex = nv;
        exHits += h;
      }
      if (exHits) {
        before.orgExport = { before: org.exportColumns, after: ex };
        await tx.organization.update({ where: { id: organizationId }, data: { exportColumns: ex as Prisma.InputJsonValue } });
      }
      for (const k of await tx.eventKitchenSettings.findMany({ where: { event: { organizationId }, allergyFieldKey: { in: oldKeys } }, select: { eventId: true, allergyFieldKey: true } })) {
        before.kitchen.push({ id: k.eventId, from: k.allergyFieldKey! });
        await tx.eventKitchenSettings.update({ where: { eventId: k.eventId }, data: { allergyFieldKey: target } });
      }

      // 4) Old names keep working everywhere else (documents, e-mails): one-hop aliases to the target.
      for (const a of await tx.fieldAlias.findMany({ where: { organizationId, targetKey: { in: oldKeys } }, select: { id: true, targetKey: true } })) {
        before.aliasesRepointed.push({ id: a.id, from: a.targetKey });
        await tx.fieldAlias.update({ where: { id: a.id }, data: { targetKey: target } });
      }
      const existingAliases = new Set((await tx.fieldAlias.findMany({ where: { organizationId, alias: { in: oldKeys } }, select: { alias: true } })).map((a) => a.alias));
      for (const o of oldKeys.filter((k) => !existingAliases.has(k))) {
        const a = await tx.fieldAlias.create({ data: { organizationId, alias: o, targetKind: "field", targetKey: target, reason: "merge", createdById: userId } });
        after.aliasIds.push(a.id);
      }
      return tx.fieldChangeLog.create({ data: { organizationId, action: "merge", byId: userId, before: before as unknown as Prisma.InputJsonValue, after: after as unknown as Prisma.InputJsonValue } });
    },
    { timeout: 120_000 },
  );
  invalidateResolverContext();
  return log;
}

/** Undo a merge / make-calculated / delete, newest state first. Returns undone / kept (changed since) counts. */
export async function undoChange(organizationId: string, logId: string): Promise<{ undone: number; kept: number } | { error: string }> {
  const log = await prisma.fieldChangeLog.findFirst({ where: { id: logId, organizationId } });
  if (!log) return { error: "not_found" };
  if (log.undoneAt) return { error: "already_undone" };
  if (log.action === "merge") {
    const deleted = await prisma.fieldChangeLog.findFirst({ where: { organizationId, action: "delete_fields", undoneAt: null, after: { path: ["mergeLogId"], equals: logId } } });
    if (deleted) return { error: "undo_delete_first" };
  }
  if (!["merge", "make_calculated", "delete_fields"].includes(log.action)) return { error: "not_undoable" };
  const claimed = await prisma.fieldChangeLog.updateMany({ where: { id: logId, undoneAt: null }, data: { undoneAt: new Date() } });
  if (!claimed.count) return { error: "already_undone" };
  let undone = 0;
  let kept = 0;
  const count = (ok: boolean) => (ok ? undone++ : kept++);

  if (log.action === "delete_fields") {
    const b = log.before as { templates: Prisma.ParticipantFieldTemplateCreateManyInput[]; copies: Prisma.EventParticipantFieldCreateManyInput[] };
    await prisma.participantFieldTemplate.createMany({ data: b.templates, skipDuplicates: true });
    await prisma.eventParticipantField.createMany({ data: b.copies, skipDuplicates: true });
    invalidateResolverContext();
    return { undone: b.templates.length + b.copies.length, kept: 0 };
  }

  if (log.action === "make_calculated") {
    const b = log.before as { fields: { table: "template" | "event"; id: string; fieldType: string; options: unknown }[]; values: ValueWrite[] };
    for (const f of b.fields) {
      // Empty options were NULL: put NULL back (leaving it out would keep the calculation's spec).
      const data = { fieldType: f.fieldType as never, options: f.options === null || f.options === undefined ? Prisma.DbNull : (f.options as Prisma.InputJsonValue) };
      if (f.table === "template") count((await prisma.participantFieldTemplate.updateMany({ where: { id: f.id, fieldType: "calculated" }, data })).count > 0);
      else count((await prisma.eventParticipantField.updateMany({ where: { id: f.id, fieldType: "calculated" }, data })).count > 0);
    }
    for (const v of b.values) count(await restoreValue(v));
    invalidateResolverContext();
    return { undone, kept };
  }

  const b = log.before as MergeBefore;
  const a = log.after as MergeAfter;
  for (const v of [...b.values].reverse()) count(await restoreValue(v));
  for (const f of b.fields) {
    if (f.table === "template") await prisma.participantFieldTemplate.updateMany({ where: { id: f.id }, data: { active: f.active } });
    else await prisma.eventParticipantField.updateMany({ where: { id: f.id }, data: { active: f.active } });
    undone++;
  }
  for (const c of b.configs) {
    const e = await prisma.event.findUnique({ where: { id: c.eventId }, select: { [c.field]: true } as Prisma.EventSelect });
    const now = e ? (e as Record<string, unknown>)[c.field] : undefined;
    const same = JSON.stringify(now ?? null) === JSON.stringify(c.after ?? null);
    if (same) await prisma.event.update({ where: { id: c.eventId }, data: { [c.field]: (c.before ?? null) as Prisma.InputJsonValue } as Prisma.EventUpdateInput });
    count(same);
  }
  // Sync mappings: put back exactly the headers / match keys the merge changed, if they still point at the target.
  for (const eventId of new Set(b.syncs.map((s) => s.eventId))) {
    const e = await prisma.event.findUnique({ where: { id: eventId }, select: { participantSyncs: true } });
    if (!e) continue;
    const list = readSyncs(e.participantSyncs).map((s) => {
      const mine = b.syncs.filter((x) => x.eventId === eventId && x.syncId === s.id);
      const mapping = { ...s.mapping };
      let matchBy = s.matchBy;
      for (const x of mine) {
        if (x.header && mapping[x.header] === a.target) {
          mapping[x.header] = x.from;
          undone++;
        } else if (x.matchBy && matchBy === a.target) {
          matchBy = x.from;
          undone++;
        } else kept++;
      }
      return { ...s, mapping, matchBy };
    });
    await prisma.event.update({ where: { id: eventId }, data: { participantSyncs: list as unknown as Prisma.InputJsonValue } });
  }
  if (b.orgExport) {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { exportColumns: true } });
    const same = JSON.stringify(org.exportColumns) === JSON.stringify(b.orgExport.after);
    if (same) await prisma.organization.update({ where: { id: organizationId }, data: { exportColumns: b.orgExport.before as Prisma.InputJsonValue } });
    count(same);
  }
  for (const k of b.kitchen) count((await prisma.eventKitchenSettings.updateMany({ where: { eventId: k.id, allergyFieldKey: a.target }, data: { allergyFieldKey: k.from } })).count > 0);
  for (const r of b.aliasesRepointed) count((await prisma.fieldAlias.updateMany({ where: { id: r.id, targetKey: a.target }, data: { targetKey: r.from } })).count > 0);
  await prisma.fieldAlias.deleteMany({ where: { id: { in: a.aliasIds } } });
  undone += a.aliasIds.length;
  if (a.docEditIds.length) await prisma.documentEdit.updateMany({ where: { id: { in: a.docEditIds }, status: "pending" }, data: { status: "discarded" } });
  invalidateResolverContext();
  return { undone, kept };
}

async function restoreValue(v: ValueWrite): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    if (v.table === "child") {
      const row = await tx.child.findUnique({ where: { id: v.id }, select: { fieldValues: true } });
      const next = row && restoreKey(row.fieldValues as Values | null, v.key, v.before, v.after);
      if (next) await tx.child.update({ where: { id: v.id }, data: { fieldValues: next as Prisma.InputJsonValue } });
      return !!next;
    }
    const row = await tx.participant.findUnique({ where: { id: v.id }, select: { customFieldValues: true } });
    const next = row && restoreKey(row.customFieldValues as Values | null, v.key, v.before, v.after);
    if (next) await tx.participant.update({ where: { id: v.id }, data: { customFieldValues: next as Prisma.InputJsonValue } });
    return !!next;
  });
}

/**
 * Deletes the (inactive) old fields of a merge -- templates and event copies; values stay in the JSON. The full rows
 * are kept in the log, so undo recreates them with the same ids.
 */
export async function deleteMergedFields(organizationId: string, userId: string | null, mergeLogId: string) {
  const merge = await prisma.fieldChangeLog.findFirst({ where: { id: mergeLogId, organizationId, action: "merge", undoneAt: null } });
  if (!merge) throw new Error("not_found");
  const oldKeys = (merge.after as MergeAfter).oldKeys;
  return prisma.$transaction(async (tx) => {
    const templates = await tx.participantFieldTemplate.findMany({ where: { organizationId, key: { in: oldKeys }, active: false } });
    const copies = await tx.eventParticipantField.findMany({ where: { key: { in: oldKeys }, active: false, event: { organizationId } } });
    await tx.participantFieldTemplate.updateMany({ where: { sourceTemplateId: { in: templates.map((t) => t.id) } }, data: { sourceTemplateId: null } });
    await tx.eventParticipantField.deleteMany({ where: { id: { in: copies.map((c) => c.id) } } });
    await tx.participantFieldTemplate.deleteMany({ where: { id: { in: templates.map((t) => t.id) } } });
    return tx.fieldChangeLog.create({ data: { organizationId, action: "delete_fields", byId: userId, before: JSON.parse(JSON.stringify({ templates, copies })), after: { mergeLogId, keys: oldKeys, templates: templates.length, copies: copies.length } } });
  });
}

/**
 * Turns a stored field into a calculated one (e.g. `adresa` = street, postcode, town). Its stored values stay in
 * the JSON; `fillFrom` first copies the stored value into that part where all parts are empty, so nobody's printed
 * value disappears.
 */
/** What a field can be turned into: joined parts (address) or an age from a date (redesign R9: age). */
export type MakeCalcSpec = { kind: "join"; parts: string[]; separator: string } | { kind: "age"; source: string; asOf: "event_start" };
export const partsOf = (spec: MakeCalcSpec) => (spec.kind === "join" ? spec.parts : [spec.source]);

export async function makeCalculated(organizationId: string, userId: string | null, key: string, spec: MakeCalcSpec, fillFrom?: string) {
  const { templates, copies } = await fieldsOf(organizationId, [key]);
  if (!templates.length && !copies.length) throw new Error("not_found");
  if (copies.some((c) => c.kind !== "custom")) throw new Error("fixed_field");
  const parts = partsOf(spec);
  if (parts.includes(key) || !parts.length || parts.some((x) => !x) || (fillFrom && (spec.kind !== "join" || !parts.includes(fillFrom)))) throw new Error("invalid_calc");
  const log = await prisma.$transaction(
    async (tx) => {
      const fieldsBefore = [
        ...(await tx.participantFieldTemplate.findMany({ where: { id: { in: templates.map((t) => t.id) } }, select: { id: true, fieldType: true, options: true } })).map((f) => ({ table: "template" as const, ...f })),
        ...(await tx.eventParticipantField.findMany({ where: { id: { in: copies.map((c) => c.id) } }, select: { id: true, fieldType: true, options: true } })).map((f) => ({ table: "event" as const, ...f })),
      ];
      const values: ValueWrite[] = [];
      if (fillFrom) {
        const empty = (m: Values) => parts.every((p) => !filled(m[p]));
        for (const c of await tx.child.findMany({ where: { organizationId }, select: { id: true, fieldValues: true } })) {
          const m = (c.fieldValues as Values | null) ?? {};
          if (!filled(m[key]) || !empty(m)) continue;
          values.push({ table: "child", id: c.id, key: fillFrom, before: null, after: m[key] });
          await tx.child.update({ where: { id: c.id }, data: { fieldValues: { ...m, [fillFrom]: m[key] } as Prisma.InputJsonValue } });
        }
        for (const p of await tx.participant.findMany({ where: { event: { organizationId } }, select: { id: true, customFieldValues: true } })) {
          const m = (p.customFieldValues as Values | null) ?? {};
          if (!filled(m[key]) || !empty(m)) continue;
          values.push({ table: "participant", id: p.id, key: fillFrom, before: null, after: m[key] });
          await tx.participant.update({ where: { id: p.id }, data: { customFieldValues: { ...m, [fillFrom]: m[key] } as Prisma.InputJsonValue } });
        }
      }
      const options = spec as unknown as Prisma.InputJsonValue;
      await tx.participantFieldTemplate.updateMany({ where: { id: { in: templates.map((t) => t.id) } }, data: { fieldType: "calculated", options } });
      await tx.eventParticipantField.updateMany({ where: { id: { in: copies.map((c) => c.id) } }, data: { fieldType: "calculated", options } });
      return tx.fieldChangeLog.create({ data: { organizationId, action: "make_calculated", byId: userId, before: JSON.parse(JSON.stringify({ fields: fieldsBefore, values })), after: { key, spec, filled: values.length } as unknown as Prisma.InputJsonValue } });
    },
    { timeout: 120_000 },
  );
  invalidateResolverContext();
  return log;
}

/** How many people would print an empty calculated value although they have a stored one (all parts empty). */
export async function calculatedLoss(organizationId: string, key: string, parts: string[]) {
  const lose = (m: Values | null) => !!m && filled(m[key]) && parts.every((p) => !filled(m[p]));
  const [children, participants] = await Promise.all([
    prisma.child.findMany({ where: { organizationId }, select: { fieldValues: true } }),
    prisma.participant.findMany({ where: { event: { organizationId } }, select: { customFieldValues: true } }),
  ]);
  return { profiles: children.filter((c) => lose(c.fieldValues as Values | null)).length, registrations: participants.filter((p) => lose(p.customFieldValues as Values | null)).length };
}

// ---- redesign R15: proposals, "not a duplicate", previews with real data ---------------------------------------

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// Known pairs written differently (Czech / English / old camelCase keys): same group = the same thing.
const SYNONYM_GROUP: Record<string, string> = { allergies: "A", alergie: "A", chronicissues: "C", chronickaonemocneni: "C", medsnotes: "M", pravidelneleky: "M", leky: "M" };
function editDistance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
/** Two fields that may be the same thing (label or key alike, or a known pair). Pure. */
export function looksDuplicate(a: { key: string; label: string; fieldType: string }, b: { key: string; label: string; fieldType: string }): boolean {
  if (!typesCompatible(a.fieldType, b.fieldType) || a.fieldType === "calculated" || b.fieldType === "calculated" || a.fieldType === "composite" || b.fieldType === "composite") return false;
  const [la, lb, ka, kb] = [norm(a.label), norm(b.label), norm(a.key.replace(/_/g, " ")), norm(b.key.replace(/_/g, " "))];
  const close = (x: string, y: string) => x.length >= 4 && y.length >= 4 && (x === y || (Math.min(x.length, y.length) >= 6 && (x.includes(y) || y.includes(x))) || (x.length >= 6 && editDistance(x, y) <= 2));
  const group = (...xs: string[]) => xs.map((x) => SYNONYM_GROUP[x.replace(/ /g, "")]).find(Boolean);
  const ga = group(la, ka);
  const syn = !!ga && ga === group(lb, kb);
  return close(la, lb) || close(ka, kb) || syn;
}
export const pairKey = (keys: string[]) => [...keys].sort().join("|");

/** Proposed duplicate pairs among the organization's active fields, minus the ones marked "not a duplicate". */
export async function duplicateProposals(organizationId: string) {
  const [templates, dismissed] = await Promise.all([
    prisma.participantFieldTemplate.findMany({ where: { organizationId, active: true }, select: { key: true, label: true, fieldType: true } }),
    prisma.fieldChangeLog.findMany({ where: { organizationId, action: "not_duplicate", undoneAt: null }, select: { after: true } }),
  ]);
  const no = new Set(dismissed.map((d) => pairKey(((d.after as { keys?: string[] }).keys ?? []))));
  const out: { keys: [string, string]; labels: [string, string] }[] = [];
  for (let i = 0; i < templates.length; i++)
    for (let j = i + 1; j < templates.length; j++) {
      const [a, b] = [templates[i], templates[j]];
      if (looksDuplicate(a, b) && !no.has(pairKey([a.key, b.key]))) out.push({ keys: [a.key, b.key], labels: [a.label, b.label] });
    }
  return out;
}

type Row = { name: string; where: "profile" | "registration"; target: string; old: Record<string, string>; result: string; status: "fill" | "differ" | "same" };
/** The merge with real data: one row per person / registration that has any of the values (first 500). */
export async function mergeRows(organizationId: string, target: string, oldKeys: string[]): Promise<Row[]> {
  const [children, participants] = await Promise.all([
    prisma.child.findMany({ where: { organizationId }, select: { name: true, fieldValues: true }, orderBy: { name: "asc" } }),
    prisma.participant.findMany({ where: { event: { organizationId } }, select: { name: true, customFieldValues: true, event: { select: { name: true } } }, orderBy: { name: "asc" } }),
  ]);
  const rows: Row[] = [];
  const add = (name: string, where: Row["where"], m: Values | null) => {
    if (!m || ![target, ...oldKeys].some((k) => filled(m[k]))) return;
    const r = mergeMap(m, oldKeys, target);
    const t = String(m[target] ?? "");
    rows.push({ name, where, target: t, old: Object.fromEntries(oldKeys.map((k) => [k, String(m[k] ?? "")])), result: String((r.next ?? m)[target] ?? ""), status: r.next ? "fill" : r.conflicts.length ? "differ" : "same" });
  };
  for (const c of children) add(c.name, "profile", c.fieldValues as Values | null);
  for (const p of participants) add(`${p.name} · ${p.event.name}`, "registration", p.customFieldValues as Values | null);
  return rows.slice(0, 500);
}

/** "Make calculated" with real data: stored value vs. what the calculation will print (first 500). */
export async function calcRows(organizationId: string, key: string, spec: MakeCalcSpec) {
  const { evaluateCalc } = await import("@/lib/field-calc");
  const [children, participants] = await Promise.all([
    prisma.child.findMany({ where: { organizationId }, select: { name: true, fieldValues: true }, orderBy: { name: "asc" } }),
    prisma.participant.findMany({ where: { event: { organizationId } }, select: { name: true, customFieldValues: true, event: { select: { name: true, startDate: true } } }, orderBy: { name: "asc" } }),
  ]);
  const parts = partsOf(spec);
  const out: { name: string; stored: string; result: string; status: "lose" | "new" | "same" | "differ" }[] = [];
  const add = (name: string, m: Values | null, eventStart: Date | null) => {
    if (!m || ![key, ...parts].some((k) => filled(m[k]))) return;
    const result = evaluateCalc(spec as never, { valueOf: (k) => (m[k] === undefined ? undefined : String(m[k])), eventStart, today: new Date() });
    const stored = String(m[key] ?? "").trim();
    out.push({ name, stored, result, status: stored && !result ? "lose" : !stored ? "new" : stored === result.trim() ? "same" : "differ" });
  };
  for (const c of children) add(c.name, c.fieldValues as Values | null, null);
  for (const p of participants) add(`${p.name} · ${p.event.name}`, p.customFieldValues as Values | null, p.event.startDate);
  return out.slice(0, 500);
}
