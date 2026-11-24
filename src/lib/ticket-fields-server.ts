// Ticket events: which of the event's fields the ticket form asks (active custom fields, in the event's order).
import { prisma } from "@/lib/prisma";
import type { TicketField } from "@/lib/ticket-fields";

export async function ticketFormFields(eventId: string): Promise<TicketField[]> {
  const rows = await prisma.eventParticipantField.findMany({
    where: { eventId, active: true, kind: "custom", fieldType: { notIn: ["calculated", "composite", "image"] } },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { key: true, label: true, fieldType: true, options: true, requiredOnRegistration: true },
  });
  return rows.map((r) => ({ key: r.key, label: r.label, fieldType: r.fieldType, options: r.options, required: r.requiredOnRegistration }));
}
