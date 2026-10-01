// Server half of Zdravotní poznámky (see health-notes.ts): the event's config
// (or its default) and the resolved notes per participant for one place.
import { prisma } from "@/lib/prisma";
import { fieldTextValues, type EventForMerge } from "@/lib/document-variables";
import { defaultHealthNotes, notesFor, sanitizeHealthNotes, type HealthNote, type HealthNoteConfig, type HealthNotePlace } from "@/lib/health-notes";

type Field = Awaited<ReturnType<typeof prisma.eventParticipantField.findMany>>[number];

export function healthNotesConfig(event: { healthNotes?: unknown }, fields: Field[]): { config: HealthNoteConfig[]; isDefault: boolean } {
  if (event.healthNotes == null) return { config: defaultHealthNotes(fields), isDefault: true };
  return { config: sanitizeHealthNotes(event.healthNotes, new Set(fields.filter((f) => f.active).map((f) => f.key))), isDefault: false };
}

/** Notes of `place` for the given participants (all of the event when omitted), keyed by participant id. */
export async function healthNotesByParticipant(eventId: string, place: HealthNotePlace | "all", participantIds?: string[]): Promise<Record<string, HealthNote[]>> {
  const [event, fields, participants] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId } }),
    prisma.eventParticipantField.findMany({ where: { eventId, active: true } }),
    prisma.participant.findMany({
      where: { eventId, ...(participantIds ? { id: { in: participantIds } } : {}) },
      include: { guardians: true },
    }),
  ]);
  const { config } = healthNotesConfig(event, fields);
  const labels = Object.fromEntries(fields.map((f) => [f.key, f.label]));
  const out: Record<string, HealthNote[]> = {};
  for (const p of participants) {
    const values = fieldTextValues({ ...p, customFieldValues: p.customFieldValues as Record<string, string> | null }, event as EventForMerge, fields);
    out[p.id] = notesFor(config, place, values, labels);
  }
  return out;
}
