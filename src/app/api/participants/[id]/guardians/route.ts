import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: participantId } = await params;
  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireModuleAccess(user, participant.eventId, "health");
  if (denied) return denied;

  const body = await req.json();
  const { name, email, relationship, receivesCommunications } = body;

  if (!email || typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "guardian_email_required" }, { status: 400 });
  }

  const guardian = await prisma.participantGuardian.create({
    data: {
      participantId,
      name: name?.trim() || null,
      email: email.trim(),
      relationship: relationship?.trim() || null,
      receivesCommunications: receivesCommunications ?? true,
    },
  });

  return NextResponse.json(guardian, { status: 201 });
}
