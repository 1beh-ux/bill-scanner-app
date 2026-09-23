import type { ListTemplateKind, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { MIN_SLOT_MINUTES, type PlanBaseActivityData } from "@/lib/planning";

// Reference fields on PlanActivity and the EventListItem kind each must point at.
const REF_KINDS = {
  primaryCategoryId: "plan_category",
  secondaryCategoryId: "plan_category",
  defaultLeaderId: "plan_leader",
  defaultLocationId: "plan_location",
} as const satisfies Record<string, ListTemplateKind>;

type ActivityInput = Omit<Prisma.PlanActivityUncheckedCreateInput, "eventId">;

/**
 * Validates a create/PATCH body for PlanActivity. Reference ids must be this
 * event's own list items of the matching kind -- otherwise a caller could link
 * another event's leaders/locations. Returns an error code or the clean data.
 */
export async function parseActivityInput(
  eventId: string,
  body: Record<string, unknown>,
  partial: boolean
): Promise<{ error: string } | { data: Partial<ActivityInput> }> {
  const data: Partial<ActivityInput> = {};

  if (body.name !== undefined || !partial) {
    if (typeof body.name !== "string" || !body.name.trim()) return { error: "name_required" };
    data.name = body.name.trim();
  }
  if (body.defaultDurationMin !== undefined || !partial) {
    const d = Number(body.defaultDurationMin);
    if (!Number.isInteger(d) || d < MIN_SLOT_MINUTES || d > 24 * 60) return { error: "invalid_duration" };
    data.defaultDurationMin = d;
  }
  for (const key of ["description", "energyLevel"] as const) {
    if (body[key] !== undefined) data[key] = typeof body[key] === "string" && body[key].trim() ? body[key].trim() : null;
  }
  for (const key of ["repeatable", "active"] as const) {
    if (body[key] !== undefined) data[key] = Boolean(body[key]);
  }

  for (const [key, kind] of Object.entries(REF_KINDS) as [keyof typeof REF_KINDS, ListTemplateKind][]) {
    const value = body[key];
    if (value === undefined) continue;
    if (value === null || value === "") {
      data[key] = null;
      continue;
    }
    if (typeof value !== "string" || !(await isEventListItem(eventId, value, kind))) return { error: "invalid_reference" };
    data[key] = value;
  }

  return { data };
}

/** True if `id` is this event's own list item of `kind` (guards cross-event references). */
export async function isEventListItem(eventId: string, id: string, kind: ListTemplateKind) {
  return (await prisma.eventListItem.count({ where: { id, eventId, kind } })) > 0;
}

// name (lowercased) -> id, per plan list kind, for resolving references by name.
async function eventItemIdsByName(eventId: string) {
  const items = await prisma.eventListItem.findMany({
    where: { eventId, kind: { in: ["plan_category", "plan_leader", "plan_location"] } },
    select: { id: true, kind: true, name: true },
  });
  const maps: Record<string, Map<string, string>> = {
    plan_category: new Map(),
    plan_leader: new Map(),
    plan_location: new Map(),
  };
  for (const item of items) maps[item.kind].set(item.name.trim().toLowerCase(), item.id);
  return (kind: "plan_category" | "plan_leader" | "plan_location", name: string | null | undefined) =>
    (name && maps[kind].get(name.trim().toLowerCase())) || null;
}

async function existingActivityKeys(eventId: string) {
  const existing = await prisma.planActivity.findMany({ where: { eventId }, select: { name: true, sourceTemplateId: true } });
  return {
    names: new Set(existing.map((a) => a.name.trim().toLowerCase())),
    templateIds: new Set(existing.map((a) => a.sourceTemplateId).filter(Boolean)),
  };
}

/**
 * Imports org base-library items (ListTemplate kind plan_activity) into the
 * event library. Skips any already imported (same template or same name).
 * Returns the PlanActivity id for every requested template -- existing or new --
 * so the board can drop a base item and immediately reference it.
 */
export async function importBaseActivities(eventId: string, templateIds?: string[]) {
  const templates = await prisma.listTemplate.findMany({
    where: { kind: "plan_activity", active: true, ...(templateIds && { id: { in: templateIds } }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const [resolve, existing] = await Promise.all([eventItemIdsByName(eventId), existingActivityKeys(eventId)]);

  let added = 0;
  for (const tpl of templates) {
    if (existing.templateIds.has(tpl.id) || existing.names.has(tpl.name.trim().toLowerCase())) continue;
    const d = (tpl.data ?? {}) as PlanBaseActivityData;
    await prisma.planActivity.create({
      data: {
        eventId,
        name: tpl.name,
        defaultDurationMin: Math.max(MIN_SLOT_MINUTES, Math.round(d.defaultDurationMin ?? 30)),
        description: d.description || null,
        primaryCategoryId: resolve("plan_category", d.primaryCategoryName),
        secondaryCategoryId: resolve("plan_category", d.secondaryCategoryName),
        energyLevel: d.energyLevel || null,
        repeatable: Boolean(d.repeatable),
        sourceTemplateId: tpl.id,
      },
    });
    existing.names.add(tpl.name.trim().toLowerCase());
    added++;
  }

  const rows = await prisma.planActivity.findMany({
    where: { eventId, sourceTemplateId: { in: templates.map((tpl) => tpl.id) } },
    select: { id: true, sourceTemplateId: true },
  });
  return { added, idsByTemplate: Object.fromEntries(rows.map((r) => [r.sourceTemplateId, r.id])) };
}

/**
 * Copies another event's activity library into this one. Category, leader and
 * location references are re-resolved by name against this event's lists
 * (leaders/locations usually differ year to year -- no match leaves them empty).
 */
export async function copyActivitiesFromEvent(eventId: string, fromEventId: string) {
  const source = await prisma.planActivity.findMany({
    where: { eventId: fromEventId, active: true },
    include: {
      primaryCategory: { select: { name: true } },
      secondaryCategory: { select: { name: true } },
      defaultLeader: { select: { name: true } },
      defaultLocation: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
  const [resolve, existing] = await Promise.all([eventItemIdsByName(eventId), existingActivityKeys(eventId)]);

  const toCreate = source.filter((a) => !existing.names.has(a.name.trim().toLowerCase()));
  if (toCreate.length > 0) {
    await prisma.planActivity.createMany({
      data: toCreate.map((a) => ({
        eventId,
        name: a.name,
        defaultDurationMin: a.defaultDurationMin,
        description: a.description,
        primaryCategoryId: resolve("plan_category", a.primaryCategory?.name),
        secondaryCategoryId: resolve("plan_category", a.secondaryCategory?.name),
        defaultLeaderId: resolve("plan_leader", a.defaultLeader?.name),
        defaultLocationId: resolve("plan_location", a.defaultLocation?.name),
        energyLevel: a.energyLevel,
        repeatable: a.repeatable,
        sourceTemplateId: a.sourceTemplateId,
      })),
    });
  }
  return { added: toCreate.length };
}
