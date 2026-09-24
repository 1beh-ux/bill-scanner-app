import { NextRequest, NextResponse } from "next/server";
import type { ListTemplateKind, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { authorizePlanning, loadPlanPayload } from "@/lib/planning-server";
import { isEventListItem, validateCategoryShares } from "@/lib/planning-activities";

const REF_KINDS: Record<string, ListTemplateKind> = {
  leaderId: "plan_leader",
  locationId: "plan_location",
};
const TEXT_FIELDS = ["customName", "description", "notes"] as const;

// Edits one scheduled block's own fields (the side panel). Structure -- which
// slot, order, duration -- goes through /planning/ops. Picking another activity
// sends that activity's defaults along from the client; they're validated here
// like any other value.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; blockId: string }> }) {
  const { id: eventId, blockId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;

  const block = await prisma.planBlock.findFirst({ where: { id: blockId, slot: { window: { day: { eventId } } } }, select: { id: true } });
  if (!block) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Prisma.PlanBlockUncheckedUpdateInput & Record<string, unknown> = {};

  for (const key of TEXT_FIELDS) {
    if (body[key] === undefined) continue;
    if (body[key] !== null && typeof body[key] !== "string") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    data[key] = body[key]?.trim() || null;
  }
  for (const [key, kind] of Object.entries(REF_KINDS)) {
    const value = body[key];
    if (value === undefined) continue;
    if (value === null || value === "") data[key] = null;
    else if (typeof value === "string" && (await isEventListItem(eventId, value, kind))) data[key] = value;
    else return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
  }
  if (body.activityId !== undefined) {
    if (body.activityId === null || body.activityId === "") data.activityId = null;
    else if (typeof body.activityId === "string" && (await prisma.planActivity.count({ where: { id: body.activityId, eventId } })) > 0) {
      data.activityId = body.activityId;
    } else return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
  }

  if (body.categories !== undefined) {
    const categories = await validateCategoryShares(eventId, body.categories);
    if (!categories) return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
    data.categories = categories;
  }
  if (body.groupNames !== undefined) {
    // Free names (the board offers Participant.groupName values); trimmed, deduped, bounded.
    if (!Array.isArray(body.groupNames) || body.groupNames.length > 50 || body.groupNames.some((g: unknown) => typeof g !== "string" || g.length > 100)) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    data.groupNames = [...new Set((body.groupNames as string[]).map((g) => g.trim()).filter(Boolean))];
  }

  await prisma.planBlock.update({ where: { id: blockId }, data });
  return NextResponse.json(await loadPlanPayload(eventId));
}
