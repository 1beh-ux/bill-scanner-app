import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizePlanning, loadPlanPayload, loadPlanState, persistPlanDiff, validateRestoreState } from "@/lib/planning-server";
import { importBaseActivities, isEventListItem, validateCategoryShares } from "@/lib/planning-activities";
import { MIN_SLOT_MINUTES, readCategoryShares } from "@/lib/planning";
import { applyOp, PlanOpError, type BlockFields, type MoveTarget, type PlanOp } from "@/lib/planning-moves";

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function parseTarget(t: unknown): MoveTarget | null {
  if (!t || typeof t !== "object") return null;
  const o = t as Record<string, unknown>;
  if (isStr(o.slotId)) return { slotId: o.slotId };
  if (isStr(o.windowId) && Number.isInteger(o.index) && (o.index as number) >= 0) return { windowId: o.windowId, index: o.index as number };
  return null;
}

// A new activity typed on the board ("+ Nová aktivita"): every reference
// validated like the side panel's PATCH; activityId optionally links it to a
// library activity that was just created for it.
async function resolveInline(eventId: string, inline: Record<string, unknown>) {
  const name = typeof inline.name === "string" ? inline.name.trim() : "";
  const durationMin = Number(inline.durationMin);
  if (!name || !Number.isInteger(durationMin) || durationMin < MIN_SLOT_MINUTES || durationMin > 24 * 60) return null;
  const categories = await validateCategoryShares(eventId, inline.categories ?? []);
  if (!categories) return null;
  for (const [key, kind] of [["leaderId", "plan_leader"], ["locationId", "plan_location"]] as const) {
    const v = inline[key];
    if (v !== null && v !== undefined && (typeof v !== "string" || !(await isEventListItem(eventId, v, kind)))) return null;
  }
  const activity = typeof inline.activityId === "string" ? await prisma.planActivity.findFirst({ where: { id: inline.activityId, eventId } }) : null;
  if (inline.activityId && !activity) return null;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 5000) : null);
  const groupNames = Array.isArray(inline.groupNames) ? inline.groupNames.filter((g): g is string => typeof g === "string" && !!g.trim()).slice(0, 50) : [];
  const block: BlockFields = {
    activityId: activity?.id ?? null,
    customName: activity && activity.name === name ? null : name,
    description: text(inline.description),
    categories,
    leaderId: (inline.leaderId as string | null | undefined) ?? null,
    locationId: (inline.locationId as string | null | undefined) ?? null,
    notes: text(inline.notes),
    groupNames,
  };
  return { durationMin, block };
}

// Library drops send a source, not block fields -- the block is built here from
// the event's own activity (a base-library item is imported first).
async function resolveInsert(eventId: string, source: Record<string, unknown>) {
  if (source.inline && typeof source.inline === "object") return resolveInline(eventId, source.inline as Record<string, unknown>);
  let activityId = isStr(source.activityId) ? source.activityId : null;
  if (!activityId && isStr(source.baseTemplateId)) {
    activityId = (await importBaseActivities(eventId, [source.baseTemplateId])).idsByTemplate[source.baseTemplateId] ?? null;
  }
  if (!activityId) return null;
  const a = await prisma.planActivity.findFirst({ where: { id: activityId, eventId } });
  if (!a) return null;
  const block: BlockFields = {
    activityId: a.id,
    customName: null,
    description: a.description,
    categories: readCategoryShares(a.categories),
    leaderId: a.defaultLeaderId,
    locationId: a.defaultLocationId,
    notes: null,
    groupNames: [],
  };
  return { durationMin: a.defaultDurationMin, block };
}

async function parseOp(eventId: string, body: Record<string, unknown>): Promise<PlanOp | null> {
  switch (body.op) {
    case "move": {
      const target = parseTarget(body.target);
      if ((body.kind !== "slot" && body.kind !== "block") || !isStr(body.id) || !target) return null;
      return { op: "move", kind: body.kind, id: body.id, target, copy: body.copy === true };
    }
    case "insert": {
      const target = parseTarget(body.target);
      const resolved = target && body.source && typeof body.source === "object" ? await resolveInsert(eventId, body.source as Record<string, unknown>) : null;
      return target && resolved ? { op: "insert", target, ...resolved } : null;
    }
    case "resize":
      return isStr(body.slotId) && typeof body.durationMin === "number" ? { op: "resize", slotId: body.slotId, durationMin: body.durationMin } : null;
    case "deleteSlot":
      return isStr(body.slotId) ? { op: "deleteSlot", slotId: body.slotId } : null;
    case "deleteBlock":
      return isStr(body.blockId) ? { op: "deleteBlock", blockId: body.blockId } : null;
    default:
      return null;
  }
}

// One structural board edit (see src/lib/planning-moves.ts). The op runs against
// this event's stored plan only, so ids from another event fail as not-found.
// Responds with the fresh full payload -- the client swaps it in for its
// optimistic state.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  // Undo: put the board back to a snapshot the client kept (see validateRestoreState).
  if (body.op === "restore") {
    let stale = false;
    await prisma.$transaction(async (tx) => {
      const { state } = await loadPlanState(eventId, tx);
      const restored = await validateRestoreState(eventId, body.state, state);
      if (!restored) {
        stale = true;
        return;
      }
      await persistPlanDiff(tx, state, restored);
    });
    if (stale) return NextResponse.json({ error: "stale" }, { status: 409 });
    return NextResponse.json(await loadPlanPayload(eventId));
  }

  const op = await parseOp(eventId, body);
  if (!op) return NextResponse.json({ error: "invalid_op" }, { status: 400 });

  try {
    // ponytail: last write wins between concurrent editors; the fresh payload
    // in every response keeps each board close to current.
    await prisma.$transaction(async (tx) => {
      const { state } = await loadPlanState(eventId, tx);
      await persistPlanDiff(tx, state, applyOp(state, op, randomUUID));
    });
  } catch (err) {
    if (err instanceof PlanOpError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
  return NextResponse.json(await loadPlanPayload(eventId));
}
