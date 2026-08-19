import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

// Lean, mail-scoped roster read -- deliberately NOT the full
// /api/events/[id]/participants route, which carries health fields
// (allergies/medsNotes/chronicIssues/otherNotes) that a mail-only grant
// must never see. Used for participant auto-detection/override in the
// inbox detail panel and the bulk status-update roster.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "mail");
  if (denied) return denied;

  const participants = await prisma.participant.findMany({
    where: { eventId, active: true },
    select: {
      id: true,
      name: true,
      guardians: {
        select: { id: true, name: true, email: true, receivesCommunications: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(participants);
}
