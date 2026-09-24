// Planning Helper computation -- port of the Apps Script plannerengine.gs as pure
// functions over plain rows (no DB), shared by the board (instant recompute on
// optimistic updates) and the server (print/CSV). See
// docs/planning-helper-module-design.md.
//
// Slot times are never stored: start = window start + sum of preceding slot
// durations in that window. A slot with 2+ blocks is parallel -- its blocks
// share the slot's time.

import type { PlanBlockRow, PlanCategoryData, PlanSlotRow, PlanState } from "@/lib/planning";

export type ComputedSlot = { slotId: string; startMin: number; endMin: number; overflow: boolean };
export type ComputedWindow = {
  windowId: string;
  usedMin: number;
  capacityMin: number; // counted toward totals: raw length for flexible, used for partial, 0 for fixed
  freeMin: number;
  overflowMin: number;
};
// refId: list item id for leader/location, the group name for group.
export type Conflict = { type: "leader" | "location" | "group"; refId: string; blockIds: [string, string]; dayId: string };

export const byOrder = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;
export const byPosition = (a: PlanSlotRow, b: PlanSlotRow) => a.position - b.position;
export const byBranch = (a: PlanBlockRow, b: PlanBlockRow) => a.branchOrder - b.branchOrder;

export function computeTimes(state: PlanState) {
  const slots: Record<string, ComputedSlot> = {};
  const windows: Record<string, ComputedWindow> = {};

  for (const w of state.windows) {
    const windowSlots = state.slots.filter((s) => s.windowId === w.id).sort(byPosition);
    let cursor = w.startMin;
    for (const s of windowSlots) {
      const end = cursor + s.durationMin;
      slots[s.id] = { slotId: s.id, startMin: cursor, endMin: end, overflow: w.kind === "flexible" && end > w.endMin };
      cursor = end;
    }
    const usedMin = cursor - w.startMin;
    const raw = Math.max(0, w.endMin - w.startMin);
    windows[w.id] =
      w.kind === "flexible"
        ? { windowId: w.id, usedMin, capacityMin: raw, freeMin: Math.max(0, raw - usedMin), overflowMin: Math.max(0, usedMin - raw) }
        : { windowId: w.id, usedMin, capacityMin: w.kind === "partial" ? usedMin : 0, freeMin: 0, overflowMin: 0 };
  }
  return { slots, windows };
}

export type CategoryRow = { categoryId: string; totalMin: number; percent: number; targetPercent: number | null };
export type EntityRow = { refId: string; totalMin: number };
export type Summary = {
  capacityMin: number;
  usedMin: number;
  freeMin: number;
  overflowMin: number;
  // Minutes of slots holding at least one counted primary category -- the base
  // for the primary categories' percentages.
  analysisMin: number;
  primaryCategories: CategoryRow[];
  secondaryCategories: CategoryRow[];
  leaders: EntityRow[];
  locations: EntityRow[];
  groups: EntityRow[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Totals over the given windows (one day, or the whole event). Category rule
 * (kept from the original tool): in a parallel slot each *distinct* category
 * present counts the full slot duration once. Primary percentages are of the
 * analysed time only (slots with a counted primary category); secondary ones
 * of all planned time. Leaders/locations: every block
 * counts its full slot duration.
 */
export function summarize(
  state: PlanState,
  windowIds: Set<string>,
  categories: { id: string; data: PlanCategoryData | null }[]
): Summary {
  const { windows: cw } = computeTimes(state);
  const summary: Summary = {
    capacityMin: 0,
    usedMin: 0,
    freeMin: 0,
    overflowMin: 0,
    analysisMin: 0,
    primaryCategories: [],
    secondaryCategories: [],
    leaders: [],
    locations: [],
    groups: [],
  };
  for (const id of windowIds) {
    const w = cw[id];
    if (!w) continue;
    summary.capacityMin += w.capacityMin;
    summary.usedMin += w.usedMin;
    summary.freeMin += w.freeMin;
    summary.overflowMin += w.overflowMin;
  }

  // Primary categories count toward the analysis unless switched off (countInAnalysis: false).
  const isCounted = (id: string) => categories.find((c) => c.id === id)?.data?.countInAnalysis !== false;
  const primary = new Map<string, number>();
  const secondary = new Map<string, number>();
  const leaders = new Map<string, number>();
  const locations = new Map<string, number>();
  const groups = new Map<string, number>();
  const add = (m: Map<string, number>, key: string | null, min: number) => key && m.set(key, (m.get(key) ?? 0) + min);

  for (const slot of state.slots) {
    if (!windowIds.has(slot.windowId)) continue;
    const blocks = state.blocks.filter((b) => b.slotId === slot.id);
    const counted = [...new Set(blocks.map((b) => b.primaryCategoryId))].filter((id) => id && isCounted(id));
    for (const id of counted) add(primary, id, slot.durationMin);
    if (counted.length > 0) summary.analysisMin += slot.durationMin;
    for (const id of new Set(blocks.map((b) => b.secondaryCategoryId))) add(secondary, id, slot.durationMin);
    for (const b of blocks) {
      add(leaders, b.leaderId, slot.durationMin);
      add(locations, b.locationId, slot.durationMin);
      for (const g of b.groupNames) add(groups, g, slot.durationMin);
    }
  }

  const target = (id: string) => categories.find((c) => c.id === id)?.data?.targetPercent ?? null;
  const toCategoryRows = (m: Map<string, number>, base: number) =>
    [...m].map(([categoryId, totalMin]) => ({
      categoryId,
      totalMin,
      percent: base > 0 ? round1((totalMin / base) * 100) : 0,
      targetPercent: target(categoryId),
    }));
  const toEntityRows = (m: Map<string, number>) => [...m].map(([refId, totalMin]) => ({ refId, totalMin }));

  summary.primaryCategories = toCategoryRows(primary, summary.analysisMin);
  summary.secondaryCategories = toCategoryRows(secondary, summary.usedMin);
  summary.leaders = toEntityRows(leaders);
  summary.locations = toEntityRows(locations);
  summary.groups = toEntityRows(groups);
  return summary;
}

/**
 * The same leader, location or participant group in two blocks whose computed
 * times overlap on the same day -- two branches of one parallel slot, or two
 * overlapping windows. New vs. the original tool. Blocks without groups are
 * "everyone" and never raise a group conflict.
 */
export function findConflicts(state: PlanState, dayIdOfWindow: (windowId: string) => string | undefined): Conflict[] {
  const { slots: times } = computeTimes(state);
  const slotById = new Map(state.slots.map((s) => [s.id, s]));
  const KEYS = [
    ["leader", (b: PlanBlockRow) => (b.leaderId ? [b.leaderId] : [])],
    ["location", (b: PlanBlockRow) => (b.locationId ? [b.locationId] : [])],
    ["group", (b: PlanBlockRow) => b.groupNames],
  ] as const;

  const timed = state.blocks.flatMap((b) => {
    const slot = slotById.get(b.slotId);
    const t = times[b.slotId];
    const dayId = slot && dayIdOfWindow(slot.windowId);
    return slot && t && dayId ? [{ b, dayId, start: t.startMin, end: t.endMin }] : [];
  });

  const conflicts: Conflict[] = [];
  for (const [type, keyOf] of KEYS) {
    // ponytail: O(n^2) per day; a camp has a few hundred blocks at most.
    for (let i = 0; i < timed.length; i++) {
      const a = timed[i];
      for (const ref of keyOf(a.b)) {
        for (let j = i + 1; j < timed.length; j++) {
          const c = timed[j];
          if (c.dayId !== a.dayId || !keyOf(c.b).includes(ref)) continue;
          if (a.start < c.end && c.start < a.end) conflicts.push({ type, refId: ref, blockIds: [a.b.id, c.b.id], dayId: a.dayId });
        }
      }
    }
  }
  return conflicts;
}

