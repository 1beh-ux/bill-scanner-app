import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

async function loadOwnedPlan(participantId: string, planId: string) {
  const plan = await prisma.participantMedPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.participantId !== participantId) return null;
  return plan;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: participantId, planId } = await params;
  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireModuleAccess(user, participant.eventId, "health");
  if (denied) return denied;

  const existing = await loadOwnedPlan(participantId, planId);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await req.json();
  const { dose, notes, active } = body;

  const updated = await prisma.participantMedPlan.update({
    where: { id: planId },
    data: {
      ...(dose !== undefined && { dose: dose || null }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(active !== undefined && { active }),
    },
    include: { eventMed: true, eventSlot: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: participantId, planId } = await params;
  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireModuleAccess(user, participant.eventId, "health");
  if (denied) return denied;

  const existing = await loadOwnedPlan(participantId, planId);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.participantMedPlan.delete({ where: { id: planId } });
  return NextResponse.json({ ok: true });
}
