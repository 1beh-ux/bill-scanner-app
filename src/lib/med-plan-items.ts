import { prisma } from "@/lib/prisma";

/** Both ids are this event's own med / slot items (a plan never points into another event). */
export async function ownMedAndSlot(eventId: string, eventMedId: unknown, eventSlotId: unknown): Promise<boolean> {
  if (typeof eventMedId !== "string" || typeof eventSlotId !== "string") return false;
  const n = await prisma.eventListItem.count({ where: { eventId, OR: [{ id: eventMedId, kind: "med" }, { id: eventSlotId, kind: "slot" }] } });
  return n === 2;
}
