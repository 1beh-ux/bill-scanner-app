import { prisma } from "@/lib/prisma";
import { FIXED_PARTICIPANT_FIELDS } from "@/lib/fixed-participant-fields";

// Adds any FIXED_PARTICIPANT_FIELDS rows this event doesn't have yet --
// same skip-existing pattern as syncParticipantFieldsForEvent, called both
// at event creation and by the one-off backfill for events that predate
// this mechanism (scripts/backfill-unified-participant-fields.ts). Kept
// separate from fixed-participant-fields.ts so that file stays importable
// from client components.
export async function seedFixedParticipantFields(eventId: string): Promise<number> {
  const existing = await prisma.eventParticipantField.findMany({
    where: { eventId, key: { in: FIXED_PARTICIPANT_FIELDS.map((f) => f.key) } },
    select: { key: true },
  });
  const existingKeys = new Set(existing.map((e) => e.key));
  const toAdd = FIXED_PARTICIPANT_FIELDS.filter((f) => !existingKeys.has(f.key));
  if (toAdd.length === 0) return 0;

  await prisma.eventParticipantField.createMany({
    data: toAdd.map((f) => ({
      eventId,
      key: f.key,
      label: f.label,
      fieldType: f.fieldType,
      kind: f.kind,
      computedType: f.computedType,
      surfaces: f.defaultSurfaces,
      isFromTemplate: false,
    })),
  });
  return toAdd.length;
}
