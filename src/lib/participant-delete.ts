import { prisma } from "@/lib/prisma";

// No cascading deletes are configured on these relations (same situation
// as Bill deletion elsewhere in this app) -- delete every dependent row in
// dependency order before the participant itself. Shared by the single
// DELETE route and the bulk delete route so they can't drift.
export async function deleteParticipantCascade(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.parentEmailLog.deleteMany({ where: { participantId: id } });
    await tx.incidentUpdate.deleteMany({ where: { incident: { participantId: id } } });
    await tx.incident.deleteMany({ where: { participantId: id } });
    await tx.participantMedPlan.deleteMany({ where: { participantId: id } });
    await tx.medChecklist.deleteMany({ where: { participantId: id } });
    await tx.participantGuardian.deleteMany({ where: { participantId: id } });
    await tx.participant.delete({ where: { id } });
  });
}
