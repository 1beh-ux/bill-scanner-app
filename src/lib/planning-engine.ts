// Planning Helper computation -- port of the Apps Script plannerengine.gs as pure
// functions over plain rows (no DB), shared by the board (instant recompute on
// optimistic updates) and the server (print/CSV). See
// docs/planning-helper-module-design.md.
//
// Slot times are never stored: start = window start + sum of preceding slot
// durations in that window. A slot with 2+ blocks is parallel -- its blocks
// share the slot's time.

import type { PlanBlockRow, PlanCategoryData, PlanCategoryShare, PlanSlotRow, PlanState } from "@/lib/planning";

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

/**
 * Minutes each category gets in a block of `durationMin`. Rules, per group
 * (main and secondary are split separately):
 * - no minutes entered -> every category counts the whole duration;
 * - minutes entered count as entered (scaled down if they exceed the block);
 *   categories without minutes share what's left.
 * Unknown category ids (deleted categories) are ignored.
 */
export function categoryMinutes(
  shares: PlanCategoryShare[],
  durationMin: number,
  groupOf: (categoryId: string) => "primary" | "secondary" | null
): Map<string, number> {
  const out = new Map<string, number>();
  for (const group of ["primary", "secondary"] as const) {
    const entries = shares.filter((s) => groupOf(s.categoryId) === group);
    const given = entries.filter((s) => s.minutes !== null);
    if (given.length === 0) {
      for (const s of entries) out.set(s.categoryId, durationMin);
      continue;
    }
    const sum = given.reduce((n, s) => n + (s.minutes ?? 0), 0);
    const scale = sum > durationMin ? durationMin / sum : 1;
    for (const s of given) out.set(s.categoryId, Math.round((s.minutes ?? 0) * scale * 10) / 10);
    const rest = entries.filter((s) => s.minutes === null);
    const left = Math.max(0, durationMin - sum * scale);
    for (const s of rest) out.set(s.categoryId, Math.round((left / rest.length) * 10) / 10);
  }
  return out;
}

/** categoryId -> group for a category list; unknown ids -> null (ignored everywhere). */
export function categoryGroupLookup(categories: { id: string; data: PlanCategoryData | null }[]) {
  const map = new Map(categories.map((c) => [c.id, c.data?.group === "secondary" ? ("secondary" as const) : ("primary" as const)]));
  return (id: string) => map.get(id) ?? null;
}

/**
 * The color mark of a block/activity: one segment per main category, weighted
 * by its minutes (same rules as the summary) -- 10 + 5 min -> 2/3 and 1/3;
 * no minutes -> equal parts. Empty when there's no main category.
 */
export function mainCategorySegments(
  categories: { id: string; data: PlanCategoryData | null }[],
  shares: PlanCategoryShare[],
  durationMin: number
): { color: string; weight: number }[] {
  const groupOf = categoryGroupLookup(categories);
  const minutes = categoryMinutes(shares, Math.max(1, durationMin), groupOf);
  return shares
    .filter((s) => groupOf(s.categoryId) === "primary" && (minutes.get(s.categoryId) ?? 0) > 0)
    .map((s) => ({
      color: categories.find((c) => c.id === s.categoryId)?.data?.color ?? "#9ca3af",
      weight: minutes.get(s.categoryId)!,
    }));
}

/** Color of the first main category in a list (cards, PDF), else null. */
export function mainCategoryColor(categories: { id: string; data: PlanCategoryData | null }[], shares: PlanCategoryShare[]) {
  const groupOf = categoryGroupLookup(categories);
  const first = shares.find((s) => groupOf(s.categoryId) === "primary");
  return categories.find((c) => c.id === first?.categoryId)?.data?.color ?? null;
}

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
  const groupOf = categoryGroupLookup(categories);
  const primary = new Map<string, number>();
  const secondary = new Map<string, number>();
  const leaders = new Map<string, number>();
  const locations = new Map<string, number>();
  const groups = new Map<string, number>();
  const add = (m: Map<string, number>, key: string | null, min: number) => key && m.set(key, (m.get(key) ?? 0) + min);

  for (const slot of state.slots) {
    if (!windowIds.has(slot.windowId)) continue;
    const blocks = state.blocks.filter((b) => b.slotId === slot.id);
    // Parallel branches: a category counts the most any one branch gives it
    // (so a category shared by two branches counts once, as before); the
    // analysed time is the most counted-main-category time of any branch.
    const perCategory = new Map<string, number>();
    let analysed = 0;
    for (const b of blocks) {
      const minutes = categoryMinutes(b.categories, slot.durationMin, groupOf);
      let countedHere = 0;
      for (const [id, min] of minutes) {
        perCategory.set(id, Math.max(perCategory.get(id) ?? 0, min));
        if (groupOf(id) === "primary" && isCounted(id)) countedHere += min;
      }
      analysed = Math.max(analysed, Math.min(slot.durationMin, countedHere));
    }
    for (const [id, min] of perCategory) {
      if (groupOf(id) === "primary") {
        if (isCounted(id)) add(primary, id, min);
      } else add(secondary, id, min);
    }
    summary.analysisMin += analysed;
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

