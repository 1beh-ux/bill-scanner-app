import { prisma } from "@/lib/prisma";
import { billsBucket } from "@/lib/gcs";

// No cascading deletes are configured on these relations (same situation
// as Bill deletion elsewhere in this app) -- delete every dependent row in
// dependency order before the participant itself. Shared by the single
// DELETE route and the bulk delete route so they can't drift.
// Pošta action-log rows are history: kept, just unlinked. Stored document
// files (GCS) go too; copies in the event's Drive folder are left alone.
export async function deleteParticipantCascade(id: string): Promise<void> {
  const files = await prisma.participantDocument.findMany({ where: { participantId: id, gcsPath: { not: null } }, select: { gcsPath: true } });
  await prisma.$transaction(async (tx) => {
    await tx.parentEmailLog.deleteMany({ where: { participantId: id } });
    await tx.incidentUpdate.deleteMany({ where: { incident: { participantId: id } } });
    await tx.incident.deleteMany({ where: { participantId: id } });
    await tx.participantMedPlan.deleteMany({ where: { participantId: id } });
    await tx.medChecklist.deleteMany({ where: { participantId: id } });
    await tx.participantDocument.deleteMany({ where: { participantId: id } });
    await tx.mailActionLog.updateMany({ where: { participantId: id }, data: { participantId: null } });
    await tx.participantGuardian.deleteMany({ where: { participantId: id } });
    await tx.participant.delete({ where: { id } });
  });
  // Best effort, after the rows are gone: an orphaned file is harmless, a failed delete isn't.
  await Promise.all(files.map((f) => billsBucket.file(f.gcsPath!).delete().catch(() => {})));
}
