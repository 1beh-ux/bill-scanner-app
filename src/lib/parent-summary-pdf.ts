import { prisma } from "@/lib/prisma";
import { renderPdf } from "@/lib/pdf-service";
import { billsBucket } from "@/lib/gcs";
import { uploadFileToFolder } from "@/lib/drive";
import { resolveIncidentState, type EffectiveIncident } from "@/lib/incident-state";
import { buildParentSummaryHtml, type SummaryIncident, type MedConfirmationRow } from "@/lib/parent-summary-template";
import { fetchMedChecklistGrid } from "@/lib/med-checklist-grid";

export async function loadParticipantSummaryIncidents(participantId: string): Promise<SummaryIncident[]> {
  const topLevel = await prisma.incident.findMany({
    where: { participantId, parentIncidentId: null },
    orderBy: { createdAt: "asc" },
    include: {
      updates: { orderBy: { updatedAt: "asc" } },
      followUps: {
        orderBy: { createdAt: "asc" },
        include: { updates: { orderBy: { updatedAt: "asc" } } },
      },
    },
  });

  let frontCount = 0;
  let backCount = 0;
  const result: SummaryIncident[] = [];

  for (const incident of topLevel) {
    const effective = resolveIncidentState(incident, incident.updates);
    if (!effective) continue;

    const followUps: EffectiveIncident[] = [];
    for (const followUp of incident.followUps) {
      const effectiveFollowUp = resolveIncidentState(followUp, followUp.updates);
      if (effectiveFollowUp) followUps.push(effectiveFollowUp);
    }

    let code: string | null = null;
    if (effective.bodyView === "front" && effective.bodyXPct !== null && effective.bodyYPct !== null) {
      frontCount += 1;
      code = `F${frontCount}`;
    } else if (effective.bodyView === "back" && effective.bodyXPct !== null && effective.bodyYPct !== null) {
      backCount += 1;
      code = `B${backCount}`;
    }

    result.push({ ...effective, followUps, code });
  }

  return result;
}

export async function generateParticipantSummaryPdf(
  participantId: string
): Promise<{ buffer: Buffer; gcsPath: string; filename: string }> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { event: true },
  });
  if (!participant) throw new Error("participant_not_found");

  const incidents = await loadParticipantSummaryIncidents(participantId);

  const grid = await fetchMedChecklistGrid(participant.eventId, participant.event.startDate, participant.event.endDate);
  const medRows: MedConfirmationRow[] = [];
  for (const row of grid.rows) {
    if (row.participantId !== participantId) continue;
    for (const slotId of row.slotIds) {
      const slotName = grid.slots.find((s) => s.id === slotId)?.name ?? "";
      medRows.push({
        medName: row.medName,
        slotName,
        cells: grid.days.map((day) => ({ date: day, ...row.days[day][slotId] })),
      });
    }
  }

  const html = buildParentSummaryHtml({
    campName: participant.event.name,
    generatedAt: new Date(),
    participantName: participant.name,
    groupName: participant.groupName,
    allergies: participant.allergies,
    medsNotes: participant.medsNotes,
    chronicIssues: participant.chronicIssues,
    otherNotes: participant.otherNotes,
    incidents,
    medConfirmation: { days: grid.days, rows: medRows },
  });

  const buffer = await renderPdf(html, "A4");

  const filename = `${participant.name.replace(/[^a-zA-Z0-9._-]/g, "_")}-${Date.now()}.pdf`;
  const gcsPath = `events/${participant.eventId}/health/parent-summaries/${filename}`;
  await billsBucket.file(gcsPath).save(buffer, { contentType: "application/pdf" });

  if (participant.event.driveExportFolderId) {
    try {
      await uploadFileToFolder(participant.event.driveExportFolderId, filename, buffer, "application/pdf");
    } catch (err) {
      // Archive copy is best-effort -- the GCS path + email log are the
      // record of truth, so a Drive hiccup shouldn't block the download/send.
      console.log(`[parent-summary-pdf] Drive archive upload failed for ${participantId}:`, String(err));
    }
  }

  return { buffer, gcsPath, filename };
}
