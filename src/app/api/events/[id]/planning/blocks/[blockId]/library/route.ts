import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { readCategoryShares } from "@/lib/planning";
import { authorizePlanning, loadPlanPayload } from "@/lib/planning-server";

// Block -> event activity library (side panel "Knihovna" section).
// { repeatable: boolean, applyToOthers?: boolean }
// - linked block: the library activity takes this block's name, duration
//   (its slot's), categories, leader, location and description; with
//   applyToOthers the other blocks of that activity take them too (their own
//   notes, groups and slot lengths stay).
// - unlinked block: saved as a new library activity and linked to it.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; blockId: string }> }) {
  const { id: eventId, blockId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;

  const block = await prisma.planBlock.findFirst({
    where: { id: blockId, slot: { window: { day: { eventId } } } },
    include: { slot: { select: { durationMin: true } }, activity: true },
  });
  if (!block) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = block.customName || block.activity?.name;
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });

  const categories = readCategoryShares(block.categories) as unknown as Prisma.InputJsonValue;
  const fields = {
    name,
    defaultDurationMin: block.slot.durationMin,
    description: block.description,
    categories,
    defaultLeaderId: block.leaderId,
    defaultLocationId: block.locationId,
    ...(typeof body.repeatable === "boolean" && { repeatable: body.repeatable }),
  };

  await prisma.$transaction(async (tx) => {
    if (block.activityId) {
      await tx.planActivity.update({ where: { id: block.activityId }, data: fields });
      const shared = { customName: null, description: block.description, categories, leaderId: block.leaderId, locationId: block.locationId };
      await tx.planBlock.update({ where: { id: block.id }, data: { customName: null } });
      if (body.applyToOthers === true) {
        await tx.planBlock.updateMany({ where: { activityId: block.activityId, id: { not: block.id } }, data: shared });
      }
    } else {
      const created = await tx.planActivity.create({ data: { eventId, ...fields } });
      await tx.planBlock.update({ where: { id: block.id }, data: { activityId: created.id, customName: null } });
    }
  });
  return NextResponse.json(await loadPlanPayload(eventId));
}
