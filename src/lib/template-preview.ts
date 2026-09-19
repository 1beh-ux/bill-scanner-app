import { prisma } from "@/lib/prisma";
import { resolveVariables } from "@/lib/document-variables";
import type { DocumentTypeData } from "@/lib/mail-reply-template";

/**
 * Loads a document type's template link and the merge values for one
 * participant, exactly as the acceptance send would resolve them -- but
 * read-only: no registration number is assigned, nothing is saved or sent.
 * Used by the template preview page (check values + preview PDF).
 */
export async function loadTemplatePreviewInput(eventId: string, docTypeId: string, participantId: string) {
  const [docType, participant, event] = await Promise.all([
    prisma.eventListItem.findFirst({ where: { id: docTypeId, eventId, kind: "document" } }),
    // Same guardian filter as the real send (loadParticipant in participant-bulk-email.ts).
    prisma.participant.findFirst({
      where: { id: participantId, eventId },
      include: { guardians: { where: { receivesCommunications: true } } },
    }),
    prisma.event.findUnique({ where: { id: eventId } }),
  ]);
  if (!docType || !participant || !event) return null;

  const templateGoogleDocId = (docType.data as DocumentTypeData | null)?.templateGoogleDocId;
  const { text, images, imageSizesMm } = await resolveVariables(
    { ...participant, customFieldValues: participant.customFieldValues as Record<string, string> | null },
    event
  );
  return { docType, participant, templateGoogleDocId, text, images, imageSizesMm };
}
