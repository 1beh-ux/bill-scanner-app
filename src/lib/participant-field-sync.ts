import { prisma } from "@/lib/prisma";
import type { ModuleKey, ParticipantFieldSurface } from "@/generated/prisma";

// Which surfaces "belong" to which module -- used to scope the sync to
// just-enabled modules (see the modules PATCH route) without re-adding
// fields whose surfaces are entirely for a module that's still off.
const MODULE_SURFACES: Record<ModuleKey, ParticipantFieldSurface[]> = {
  bills: [],
  health: ["health_list", "health_detail"],
  mail: ["mail_list"],
};

/**
 * Copies active org-wide ParticipantFieldTemplate rows into an event's
 * EventParticipantField list, skipping any key already present. Two
 * callers: the Účastníci tab's manual "sync from templates" button (no
 * `moduleFilter` -- copies everything), and the modules PATCH route when
 * a module flips from disabled to enabled (`moduleFilter` set -- only
 * copies templates whose defaultSurfaces actually belong to that module,
 * so health fields don't appear just because Mail got turned on).
 */
export async function syncParticipantFieldsForEvent(eventId: string, moduleFilter?: ModuleKey): Promise<number> {
  const [templates, existing] = await Promise.all([
    prisma.participantFieldTemplate.findMany({ where: { active: true } }),
    prisma.eventParticipantField.findMany({ where: { eventId }, select: { key: true } }),
  ]);
  const existingKeys = new Set(existing.map((e) => e.key));

  const relevant = moduleFilter
    ? templates.filter((t) => t.defaultSurfaces.some((s) => MODULE_SURFACES[moduleFilter].includes(s)))
    : templates;
  const toAdd = relevant.filter((t) => !existingKeys.has(t.key));

  if (toAdd.length > 0) {
    await prisma.eventParticipantField.createMany({
      data: toAdd.map((t) => ({
        eventId,
        key: t.key,
        label: t.label,
        fieldType: t.fieldType,
        options: t.options ?? undefined,
        surfaces: t.defaultSurfaces,
        isFromTemplate: true,
      })),
    });
  }

  return toAdd.length;
}
