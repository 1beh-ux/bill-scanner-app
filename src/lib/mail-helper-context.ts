import { prisma } from "@/lib/prisma";
import type { DocumentListItem, DocumentTypeData } from "@/lib/mail-reply-template";

export async function getActiveDocumentTypes(eventId: string): Promise<DocumentListItem[]> {
  const items = await prisma.eventListItem.findMany({
    where: { eventId, kind: "document", active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return items.map((i) => ({
    id: i.id,
    key: i.key,
    name: i.name,
    data: (i.data as DocumentTypeData | null) ?? null,
  }));
}

export async function getReceivedItemIds(participantId: string): Promise<Set<string>> {
  const rows = await prisma.participantDocument.findMany({
    where: { participantId },
    select: { eventListItemId: true },
  });
  return new Set(rows.map((r) => r.eventListItemId));
}

export async function requireEventSenderEmail(eventId: string): Promise<string> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { senderEmail: true } });
  if (!event?.senderEmail) throw new Error("sender_not_configured");
  return event.senderEmail;
}
