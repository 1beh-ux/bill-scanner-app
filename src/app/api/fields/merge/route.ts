// Fields Manager phase 7 (design §12) -- clean-up: merge duplicate fields, make a field calculated, delete merged
// fields; each logged with everything it changed and undoable. Organization admins with the flag only.
//   GET                                                   -> suggested groups, past clean-ups (undoable)
//   POST {action: "preview", target, oldKeys}             -> counts
//   POST {action: "merge", target, oldKeys, mode, confirm} (confirm must equal target)
//   POST {action: "calc_preview", key, parts}             -> who would print an empty value
//   POST {action: "make_calculated", key, parts, separator, fillFrom?, confirm}
//   POST {action: "delete", logId, confirm}  |  {action: "undo", logId}
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { applyMerge, calcRows, calculatedLoss, deleteMergedFields, duplicateProposals, makeCalculated, mergePreview, mergeRows, pairKey, partsOf, undoChange, SUGGESTED_GROUPS, type MakeCalcSpec } from "@/lib/field-merge";
import { queueRenamesWhereUsed } from "@/lib/doc-editor";
import { fieldsManagerAccess } from "../access";

const keys = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string" && /^[a-zA-Z][a-zA-Z0-9_]{0,59}$/.test(k)).slice(0, 10) : []);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const fail = (err: unknown) => {
  const code = err instanceof Error ? err.message : "failed";
  if (!/^[a-z_]+$/.test(code)) console.error("[fields/merge]", err);
  return NextResponse.json({ error: /^[a-z_]+$/.test(code) ? code : "failed" }, { status: 400 });
};

/** The body's calculation: joined parts (default) or an age from a date field. */
function calcSpec(b: Record<string, unknown>): MakeCalcSpec {
  if (b.kind === "age") return { kind: "age", source: keys([b.source])[0] ?? "", asOf: "event_start" };
  return { kind: "join", parts: keys(b.parts), separator: typeof b.separator === "string" ? b.separator.slice(0, 10) : ", " };
}

export async function GET() {
  const a = await fieldsManagerAccess();
  if ("error" in a) return a.error;
  const [templates, logs] = await Promise.all([
    prisma.participantFieldTemplate.findMany({ where: { organizationId: a.organizationId }, select: { key: true, label: true, active: true } }),
    prisma.fieldChangeLog.findMany({ where: { organizationId: a.organizationId, action: { in: ["merge", "make_calculated", "delete_fields"] } }, orderBy: { at: "desc" }, take: 30, select: { id: true, action: true, at: true, undoneAt: true, after: true } }),
  ]);
  const have = new Set(templates.map((t) => t.key));
  return NextResponse.json({
    proposals: await duplicateProposals(a.organizationId),
    // Age typed by hand next to the birth date (redesign R9): offered as "make calculated".
    ageProposal: have.has("vek_ucastnika") ? { key: "vek_ucastnika", source: "datum_narozeni" } : null,
    suggestions: SUGGESTED_GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => have.has(k)) })).filter((g) => g.keys.length >= 2 && g.keys.includes(g.target)),
    log: logs.map((l) => ({ id: l.id, action: l.action, at: l.at, undoneAt: l.undoneAt, ...pick(l.after) })),
  });
}

// Only what the list shows (no values, no conflict contents).
function pick(after: Prisma.JsonValue) {
  const o = (after ?? {}) as Record<string, unknown>;
  return { target: o.target ?? o.key ?? null, oldKeys: o.oldKeys ?? o.keys ?? [], mode: o.mode ?? null, moved: o.moved ?? o.filled ?? null, conflicts: Array.isArray(o.conflicts) ? o.conflicts.length : null, mergeLogId: o.mergeLogId ?? null };
}

export async function POST(req: NextRequest) {
  const a = await fieldsManagerAccess();
  if ("error" in a) return a.error;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const target = str(b.target);
  const oldKeys = keys(b.oldKeys);
  try {
    switch (b.action) {
      case "preview":
        return NextResponse.json(await mergePreview(a.organizationId, target, oldKeys));
      case "merge": {
        if (b.confirm !== target) return NextResponse.json({ error: "confirm_mismatch" }, { status: 400 });
        const mode = b.mode === "direct" ? "direct" : "alias";
        const log = await applyMerge(a.organizationId, a.userId, target, oldKeys, mode);
        let docs = null;
        if (mode === "direct") {
          docs = await queueRenamesWhereUsed(a.organizationId, a.userId, oldKeys.map((from) => ({ from, to: target })));
          await prisma.fieldChangeLog.update({ where: { id: log.id }, data: { after: { ...(log.after as object), docEditIds: docs.ids } } });
        }
        const after = log.after as { moved: number; conflicts: { table: string; id: string; key: string }[] };
        return NextResponse.json({ logId: log.id, moved: after.moved, conflicts: after.conflicts.length, docEdits: docs?.ids.length ?? 0, unreadableDocs: docs?.unreadable ?? 0 });
      }
      case "rows":
        return NextResponse.json({ rows: await mergeRows(a.organizationId, target, oldKeys) });
      case "not_duplicate": {
        if (oldKeys.length !== 2) return NextResponse.json({ error: "invalid" }, { status: 400 });
        await prisma.fieldChangeLog.create({ data: { organizationId: a.organizationId, action: "not_duplicate", byId: a.userId, before: {}, after: { keys: pairKey(oldKeys).split("|") } } });
        return NextResponse.json({ ok: true });
      }
      case "calc_preview": {
        const spec = calcSpec(b);
        return NextResponse.json({ ...(await calculatedLoss(a.organizationId, str(b.key), partsOf(spec))), rows: await calcRows(a.organizationId, str(b.key), spec) });
      }
      case "make_calculated": {
        if (b.confirm !== str(b.key)) return NextResponse.json({ error: "confirm_mismatch" }, { status: 400 });
        const log = await makeCalculated(a.organizationId, a.userId, str(b.key), calcSpec(b), str(b.fillFrom) || undefined);
        return NextResponse.json({ logId: log.id, filled: (log.after as { filled: number }).filled });
      }
      case "delete": {
        const merge = await prisma.fieldChangeLog.findFirst({ where: { id: str(b.logId), organizationId: a.organizationId, action: "merge" }, select: { after: true } });
        if (!merge || b.confirm !== (merge.after as { target: string }).target) return NextResponse.json({ error: "confirm_mismatch" }, { status: 400 });
        const log = await deleteMergedFields(a.organizationId, a.userId, str(b.logId));
        return NextResponse.json({ logId: log.id });
      }
      case "undo": {
        const r = await undoChange(a.organizationId, str(b.logId));
        return "error" in r ? NextResponse.json(r, { status: 409 }) : NextResponse.json(r);
      }
    }
  } catch (err) {
    return fail(err);
  }
  return NextResponse.json({ error: "invalid" }, { status: 400 });
}
