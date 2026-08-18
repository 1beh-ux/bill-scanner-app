import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

async function loadGuardianWithEvent(guardianId: string) {
  return prisma.participantGuardian.findUnique({
    where: { id: guardianId },
    include: { participant: { select: { eventId: true } } },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; guardianId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { guardianId } = await params;
  const guardian = await loadGuardianWithEvent(guardianId);
  if (!guardian) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireModuleAccess(user, guardian.participant.eventId, "health");
  if (denied) return denied;

  const body = await req.json();
  const { name, email, relationship, receivesCommunications } = body;

  if (email !== undefined && (typeof email !== "string" || !email.trim())) {
    return NextResponse.json({ error: "guardian_email_required" }, { status: 400 });
  }

  const updated = await prisma.participantGuardian.update({
    where: { id: guardianId },
    data: {
      ...(name !== undefined && { name: name?.trim() || null }),
      ...(email !== undefined && { email: email.trim() }),
      ...(relationship !== undefined && { relationship: relationship?.trim() || null }),
      ...(receivesCommunications !== undefined && { receivesCommunications }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; guardianId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { guardianId } = await params;
  const guardian = await loadGuardianWithEvent(guardianId);
  if (!guardian) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireModuleAccess(user, guardian.participant.eventId, "health");
  if (denied) return denied;

  await prisma.participantGuardian.delete({ where: { id: guardianId } });

  return NextResponse.json({ ok: true });
}
