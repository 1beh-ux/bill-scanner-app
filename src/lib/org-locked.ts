// Round 2 (2026-11-23): "pevná pole" in two layers.
//   1. System fields the app needs (registration identity, age price, linking to Lidé, the children's guardian):
//      always asked, nobody switches them off -- only where they are shown changes.
//   2. Pevná pole organizace: fields the organization admin marks; present and required in every event, event
//      managers can't switch them off or delete them (the admin unlocks them in the Fields Manager).
// Stored per organization (AppSetting "fm_locked:<org>"); enforced only with the Fields Manager flag on.
import { prisma } from "@/lib/prisma";

export const SYSTEM_KEYS = new Set(["participant_first_name", "participant_last_name", "datum_narozeni", "zast_jmeno", "Email"]);
const settingKey = (organizationId: string) => `fm_locked:${organizationId}`;

export async function lockedKeys(organizationId: string): Promise<Set<string>> {
  const row = await prisma.appSetting.findUnique({ where: { key: settingKey(organizationId) } });
  return new Set(Array.isArray(row?.value) ? (row!.value as unknown[]).filter((k): k is string => typeof k === "string") : []);
}

/**
 * Lock / unlock an organization field. Locking makes it required by default (new events copy that) and, in every
 * event that hasn't ended, present, active and required; unlocking only lifts the protection (nothing is switched off).
 */
export async function setLocked(organizationId: string, key: string, on: boolean, userId: string | null): Promise<{ events: number }> {
  const template = await prisma.participantFieldTemplate.findFirst({ where: { organizationId, key } });
  if (!template) throw new Error("no_template");
  const now = await lockedKeys(organizationId);
  if (on) now.add(key);
  else now.delete(key);
  let events = 0;
  await prisma.$transaction(async (tx) => {
    await tx.appSetting.upsert({ where: { key: settingKey(organizationId) }, update: { value: [...now] }, create: { key: settingKey(organizationId), value: [...now] } });
    if (on) {
      await tx.participantFieldTemplate.update({ where: { id: template.id }, data: { requiredInRegistration: true, active: true } });
      const today = new Date(new Date().toISOString().slice(0, 10));
      const open = await tx.event.findMany({ where: { organizationId, endDate: { gte: today } }, select: { id: true } });
      for (const e of open) {
        const copy = await tx.eventParticipantField.findFirst({ where: { eventId: e.id, key } });
        if (copy) await tx.eventParticipantField.update({ where: { id: copy.id }, data: { active: true, ...(copy.kind === "custom" && { requiredOnRegistration: true }) } });
        else await tx.eventParticipantField.create({ data: { eventId: e.id, key, label: template.label, fieldType: template.fieldType, options: (template.options ?? undefined) as never, surfaces: template.defaultSurfaces, isFromTemplate: true, requiredOnRegistration: true } });
        events++;
      }
    }
    await tx.fieldChangeLog.create({ data: { organizationId, action: on ? "lock" : "unlock", byId: userId, before: {}, after: { key, events } } });
  });
  return { events };
}

/** Why an event-level change of this field is refused, or null (the event field admin's PATCH / DELETE). */
export async function lockBlocker(organizationId: string, flagOn: boolean, key: string, change: { active?: unknown; requiredOnRegistration?: unknown; rename?: boolean; remove?: boolean }): Promise<string | null> {
  if (!flagOn) return null;
  if (SYSTEM_KEYS.has(key) && (change.active === false || change.remove)) return "system_field";
  if (!(await lockedKeys(organizationId)).has(key)) return null;
  return change.active === false || change.requiredOnRegistration === false || change.rename || change.remove ? "locked_field" : null;
}
