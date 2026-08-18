import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { resolveSubjectPreview } from "@/lib/parent-email-send";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: participantId } = await params;
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { guardians: { where: { receivesCommunications: true } } },
  });
  if (!participant) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireModuleAccess(user, participant.eventId, "health");
  if (denied) return denied;

  const subject = await resolveSubjectPreview(participantId, user.displayName);
  return NextResponse.json({
    subject,
    recipients: participant.guardians.map((g) => ({ name: g.name, email: g.email })),
  });
}
