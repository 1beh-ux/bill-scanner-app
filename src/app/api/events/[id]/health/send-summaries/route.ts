import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { sendSummaryToGuardians, type GuardianSendResult } from "@/lib/parent-email-send";

interface ParticipantSendResult {
  participantId: string;
  participantName: string;
  guardians: GuardianSendResult[];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const participantIds: string[] | undefined = body.participantIds;

  const participants = await prisma.participant.findMany({
    where: { eventId, ...(participantIds ? { id: { in: participantIds } } : {}) },
    select: { id: true, name: true },
  });

  const results: ParticipantSendResult[] = [];
  for (const participant of participants) {
    try {
      const guardians = await sendSummaryToGuardians(participant.id, user.id);
      if (guardians.length === 0) continue;
      results.push({ participantId: participant.id, participantName: participant.name, guardians });
    } catch (err) {
      results.push({
        participantId: participant.id,
        participantName: participant.name,
        guardians: [{ guardianId: "", guardianEmail: "", status: "failed", errorMessage: err instanceof Error ? err.message : String(err) }],
      });
    }
  }

  return NextResponse.json({ results });
}
