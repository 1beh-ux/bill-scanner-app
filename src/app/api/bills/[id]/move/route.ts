import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { moveBillToEvent } from "@/lib/bill-move";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const bill = await prisma.bill.findUnique({ where: { id }, select: { eventId: true } });
  if (!bill) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireModuleAccess(user, bill.eventId, "bills");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const targetEventId: string | undefined = body.targetEventId;
  if (!targetEventId) {
    return NextResponse.json({ error: "target_event_id_required" }, { status: 400 });
  }

  const result = await moveBillToEvent(id, targetEventId, user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    matchedCategories: result.matchedCategories,
    droppedCategories: result.droppedCategories,
  });
}