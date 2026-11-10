// Creating an event with the organization's defaults (category, list and field templates, modules,
// the fixed participant fields) -- the "Nová akce" form and "Duplikovat akci" (src/lib/event-duplicate.ts) share it.
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";
import { seedFixedParticipantFields } from "@/lib/participant-field-seed";
import { optionsFor } from "@/lib/registration-fields";

export async function createEventWithDefaults(o: { name: string; startDate: string; endDate: string; organizationId: string; isPublic: boolean; isTest?: boolean }) {
  const { name, startDate, endDate, isPublic } = o;
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        organizationId: o.organizationId,
        ...(isPublic && { kind: "public_event" as const }),
        ...(o.isTest && { isTest: true }),
      },
    });

    // The organization's category templates (app-level NULL rows: later, step 4).
    const templates = await tx.categoryTemplate.findMany({ where: { organizationId: created.organizationId } });

    if (templates.length > 0) {
      await tx.eventCategory.createMany({
        data: templates.map((t) => ({
          eventId: created.id,
          name: t.name,
          description: t.description,
          budgetAmount: 0,
          isFromTemplate: true,
          categoryTemplateId: t.id,
        })),
      });
    }

    // plan_activity is the org base library -- imported into PlanActivity on
    // demand, never copied as an event list item.
    const listTemplates = isPublic ? [] : await tx.listTemplate.findMany({ where: { organizationId: created.organizationId, active: true, kind: { not: "plan_activity" } } });
    if (listTemplates.length > 0) {
      await tx.eventListItem.createMany({
        data: listTemplates.map((lt) => ({
          eventId: created.id,
          kind: lt.kind,
          key: lt.key,
          name: lt.name,
          sortOrder: lt.sortOrder,
          data: lt.data ?? undefined,
          isFromTemplate: true,
        })),
      });
    }

    await tx.eventModule.createMany({
      data: [
        { eventId: created.id, moduleKey: "bills", enabled: true },
        { eventId: created.id, moduleKey: "health", enabled: false },
        ...(isPublic ? [{ eventId: created.id, moduleKey: "tickets" as const, enabled: true }] : []),
        // A membership year is all about registration: Děti + Přihláška + Portál on from the start.
        ...(created.kind === "membership" ? (["participants", "registration", "portal"] as const).map((moduleKey) => ({ eventId: created.id, moduleKey, enabled: true })) : []),
      ],
    });

    const fieldTemplates = isPublic ? [] : await tx.participantFieldTemplate.findMany({ where: { organizationId: created.organizationId, active: true } });
    if (fieldTemplates.length > 0) {
      await tx.eventParticipantField.createMany({
        data: fieldTemplates.map((f) => ({
          eventId: created.id,
          key: f.key,
          label: f.label,
          fieldType: f.fieldType,
          options: (optionsFor(f) as Prisma.InputJsonValue | null) ?? undefined,
          // Was hardcoded to ["list"], ignoring the template's own
          // defaultSurfaces -- inconsistent with syncParticipantFieldsForEvent,
          // which already gets this right.
          surfaces: f.defaultSurfaces,
          isFromTemplate: true,
        })),
      });
    }

    return created;
  });

  if (!isPublic) await seedFixedParticipantFields(event.id);
  return event;
}
