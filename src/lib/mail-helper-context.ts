import { prisma } from "@/lib/prisma";
import type { DocumentListItem, DocumentTypeData } from "@/lib/mail-reply-template";
import { RECEIVED_WHERE } from "@/lib/registration-status";
import { profileDocuments } from "@/lib/person-documents";

export async function getActiveDocumentTypes(eventId: string): Promise<DocumentListItem[]> {
  const items = await prisma.eventListItem.findMany({
    where: { eventId, kind: "document", active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  // Fixed attachments (staticAttachment) are never received back -- not tracked.
  return items
    .filter((i) => !(i.data as DocumentTypeData | null)?.staticAttachment)
    .map((i) => ({
      id: i.id,
      key: i.key,
      name: i.name,
      data: (i.data as DocumentTypeData | null) ?? null,
    }));
}

// "Received" means a guardian actually sent it back (receivedVia: email or
// manual -- the latter covering e.g. a parent handing over a printout in
// person). A `generated` row exists only because we sent them a blank
// form to fill out (see src/lib/participant-document-store.ts) -- it's
// stored for backup/Drive-sync, not a sign anything came back, so it must
// not count here. Neither does a portal upload waiting for review or rejected
// (slice 4 #6) -- every status e-mail / sheet export reads this. A type the
// linked person's permanent document covers counts as received (slice 6 #4).
export async function getReceivedItemIds(participantId: string): Promise<Set<string>> {
  const [rows, participant] = await Promise.all([
    prisma.participantDocument.findMany({
      where: { participantId, ...RECEIVED_WHERE },
      select: { eventListItemId: true },
    }),
    prisma.participant.findUnique({ where: { id: participantId }, select: { id: true, eventId: true, childId: true } }),
  ]);
  const fromProfile = participant ? ((await profileDocuments([participant])).get(participantId) ?? []) : [];
  return new Set([...rows, ...fromProfile].map((r) => r.eventListItemId));
}

export async function requireEventSenderEmail(eventId: string): Promise<string> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { senderEmail: true } });
  if (!event?.senderEmail) throw new Error("sender_not_configured");
  return event.senderEmail;
}
