import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { deleteParticipantCascade } from "@/lib/participant-delete";

interface FailureDetail {
  participantId: string;
  name: string;
  error: string;
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

  const body = await req.json();
  const action: string = body.action;
  const participantIds: string[] = body.participantIds || [];

  if (action !== "delete") {
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }
  if (participantIds.length === 0) {
    return NextResponse.json({ error: "no_participants_selected" }, { status: 400 });
  }

  // Only operate on participants that actually belong to this event.
  const participants = await prisma.participant.findMany({
    where: { id: { in: participantIds }, eventId },
    select: { id: true, name: true },
  });
  const nameById = new Map(participants.map((p) => [p.id, p.name]));

  const succeeded: string[] = [];
  const failed: FailureDetail[] = [];

  for (const participant of participants) {
    try {
      await deleteParticipantCascade(participant.id);
      succeeded.push(participant.id);
    } catch {
      failed.push({
        participantId: participant.id,
        name: nameById.get(participant.id) || participant.id,
        error: "delete_failed",
      });
    }
  }

  return NextResponse.json({
    action,
    succeededCount: succeeded.length,
    failedCount: failed.length,
    succeeded,
    failed,
  });
}
