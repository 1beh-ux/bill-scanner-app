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
export type Conflict = { type: "leader" | "location"; refId: string; blockIds: [string, string]; dayId: string };

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
  primaryCategories: CategoryRow[];
  secondaryCategories: CategoryRow[];
  leaders: EntityRow[];
  locations: EntityRow[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Totals over the given windows (one day, or the whole event). Category rule
 * (kept from the original tool): in a parallel slot each *distinct* category
 * present counts the full slot duration once. Leaders/locations: every block
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
    primaryCategories: [],
    secondaryCategories: [],
    leaders: [],
    locations: [],
  };
  for (const id of windowIds) {
    const w = cw[id];
    if (!w) continue;
    summary.capacityMin += w.capacityMin;
    summary.usedMin += w.usedMin;
    summary.freeMin += w.freeMin;
    summary.overflowMin += w.overflowMin;
  }

  const primary = new Map<string, number>();
  const secondary = new Map<string, number>();
  const leaders = new Map<string, number>();
  const locations = new Map<string, number>();
  const add = (m: Map<string, number>, key: string | null, min: number) => key && m.set(key, (m.get(key) ?? 0) + min);

  for (const slot of state.slots) {
    if (!windowIds.has(slot.windowId)) continue;
    const blocks = state.blocks.filter((b) => b.slotId === slot.id);
    for (const id of new Set(blocks.map((b) => b.primaryCategoryId))) add(primary, id, slot.durationMin);
    for (const id of new Set(blocks.map((b) => b.secondaryCategoryId))) add(secondary, id, slot.durationMin);
    for (const b of blocks) {
      add(leaders, b.leaderId, slot.durationMin);
      add(locations, b.locationId, slot.durationMin);
    }
  }

  const target = (id: string) => categories.find((c) => c.id === id)?.data?.targetPercent ?? null;
  const toCategoryRows = (m: Map<string, number>) =>
    [...m].map(([categoryId, totalMin]) => ({
      categoryId,
      totalMin,
      percent: summary.usedMin > 0 ? round1((totalMin / summary.usedMin) * 100) : 0,
      targetPercent: target(categoryId),
    }));
  const toEntityRows = (m: Map<string, number>) => [...m].map(([refId, totalMin]) => ({ refId, totalMin }));

  summary.primaryCategories = toCategoryRows(primary);
  summary.secondaryCategories = toCategoryRows(secondary);
  summary.leaders = toEntityRows(leaders);
  summary.locations = toEntityRows(locations);
  return summary;
}

/**
 * The same leader or location in two blocks whose computed times overlap on
 * the same day -- two branches of one parallel slot, or two overlapping
 * windows. New vs. the original tool. Keyed generically so participant groups
 * (phase 2) plug in as one more entry in KEYS.
 */
export function findConflicts(state: PlanState, dayIdOfWindow: (windowId: string) => string | undefined): Conflict[] {
  const { slots: times } = computeTimes(state);
  const slotById = new Map(state.slots.map((s) => [s.id, s]));
  const KEYS = [
    ["leader", (b: PlanBlockRow) => b.leaderId],
    ["location", (b: PlanBlockRow) => b.locationId],
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
      const ref = keyOf(a.b);
      if (!ref) continue;
      for (let j = i + 1; j < timed.length; j++) {
        const c = timed[j];
        if (c.dayId !== a.dayId || keyOf(c.b) !== ref) continue;
        if (a.start < c.end && c.start < a.end) conflicts.push({ type, refId: ref, blockIds: [a.b.id, c.b.id], dayId: a.dayId });
      }
    }
  }
  return conflicts;
}

