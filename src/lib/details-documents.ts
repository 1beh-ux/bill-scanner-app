// Documents received by filling in the details (2026-10-27): an event document type marked
// "Splněno vyplněním podrobných údajů" (DocumentTypeData.fromDetails) counts as received once every
// field the event asks of that person is filled ("Podrobné údaje" = vyplněno, document-variables.ts) --
// the health questionnaire whose questions became fields. Added next to the person's permanent
// documents wherever documents are counted (roster, Dokumenty, portal card, checklists, export).
import { prisma } from "@/lib/prisma";
import { detailsAsk } from "@/lib/children";
import { detailsStatus } from "@/lib/document-variables";
import type { DocumentTypeData } from "@/lib/mail-reply-template";

export type DetailsDoc = { eventListItemId: string; receivedVia: "details"; reviewStatus: null };

/** Per participant: the "from details" document types its filled-in details cover. */
export async function detailsDocuments(participantIds: string[]): Promise<Map<string, DetailsDoc[]>> {
  const out = new Map<string, DetailsDoc[]>();
  if (participantIds.length === 0) return out;
  const participants = await prisma.participant.findMany({
    where: { id: { in: participantIds } },
    select: { id: true, eventId: true, childId: true, isAdult: true, dateOfBirth: true, customFieldValues: true, name: true, groupName: true, registrationStatus: true, registrationNumber: true, event: { select: { startDate: true } } },
  });
  const eventIds = [...new Set(participants.map((p) => p.eventId))];
  const types = (await prisma.eventListItem.findMany({ where: { eventId: { in: eventIds }, kind: "document", active: true } })).filter((t) => (t.data as DocumentTypeData | null)?.fromDetails);
  if (types.length === 0) return out;
  const asks = new Map(await Promise.all([...new Set(types.map((t) => t.eventId))].map(async (id) => [id, await detailsAsk(id)] as const)));
  for (const p of participants) {
    const mine = types.filter((t) => t.eventId === p.eventId);
    const ask = asks.get(p.eventId);
    if (!mine.length || !ask) continue;
    const status = detailsStatus({ ...p, customFieldValues: p.customFieldValues as Record<string, string> | null, guardians: [] }, { startDate: p.event.startDate, detailsAsk: ask } as Parameters<typeof detailsStatus>[1]);
    if (status === "vyplněno") out.set(p.id, mine.map((t) => ({ eventListItemId: t.id, receivedVia: "details" as const, reviewStatus: null })));
  }
  return out;
}
