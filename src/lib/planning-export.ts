// Schedule exports, pure: structured days (PDF / print, parallel blocks side by
// side) and flat rows (CSV, Drive sheet -- the old Export_Schedule sheet).

import { minutesToHhmm, type PlanCategoryShare, type PlanPayload } from "@/lib/planning";
import { byBranch, byPosition, categoryGroupLookup, categoryMinutes, computeTimes, mainCategoryColor, mainCategorySegments } from "@/lib/planning-engine";

export type ScheduleRow = {
  dayId: string;
  dayLabel: string;
  date: string | null;
  windowName: string;
  windowStart: string;
  windowEnd: string;
  start: string;
  end: string;
  startMin: number;
  durationMin: number;
  parallel: boolean;
  activity: string;
  description: string;
  primaryCategory: string; // "Teorie (10), Praxe (20)"
  primaryColor: string | null; // first main category's color
  secondaryCategory: string;
  categoryMinutes: Record<string, number>; // categoryId -> minutes (per categoryMinutes())
  mainCategoryIds: string[]; // in the block's order
  mainSegments: { color: string; weight: number }[]; // color mark (mainCategorySegments)
  leader: string;
  leaderId: string | null;
  location: string;
  groups: string; // comma-separated; empty = everyone
  notes: string;
};

/** A block's category list as export columns. */
export function categoryColumns(p: PlanPayload, shares: PlanCategoryShare[], durationMin: number) {
  const groupOf = categoryGroupLookup(p.categories);
  const minutes = categoryMinutes(shares, durationMin, groupOf);
  const label = (group: "primary" | "secondary") =>
    shares
      .filter((s) => groupOf(s.categoryId) === group)
      .map((s) => {
        const n = p.categories.find((c) => c.id === s.categoryId)?.name ?? "";
        return s.minutes !== null ? `${n} (${minutes.get(s.categoryId)})` : n;
      })
      .join(", ");
  return {
    primaryCategory: label("primary"),
    primaryColor: mainCategoryColor(p.categories, shares),
    secondaryCategory: label("secondary"),
    categoryMinutes: Object.fromEntries(minutes),
    mainCategoryIds: shares.filter((s) => groupOf(s.categoryId) === "primary").map((s) => s.categoryId),
    mainSegments: mainCategorySegments(p.categories, shares, durationMin),
  };
}

export type ScheduleFilter = { dayIds?: Set<string>; leaderId?: string; group?: string };
export type ScheduleSlot = { start: string; end: string; startMin: number; durationMin: number; branches: ScheduleRow[] };
export type ScheduleWindow = { name: string; start: string; end: string; slots: ScheduleSlot[] };
export type ScheduleDay = { id: string; label: string; date: string | null; theme: string | null; windows: ScheduleWindow[] };

/**
 * The schedule as days -> windows -> slots -> branches (parallel blocks side by
 * side), filtered. `group` keeps that group's blocks plus blocks without groups
 * (meant for everyone). Slots/windows left empty by a filter are dropped;
 * filtered-out days are dropped, but kept days stay even when empty.
 */
export function scheduleDays(p: PlanPayload, opts: ScheduleFilter = {}): ScheduleDay[] {
  const times = computeTimes(p);
  const name = (list: { id: string; name: string }[], id: string | null) => (id && list.find((x) => x.id === id)?.name) || "";

  return [...p.days]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((day) => !opts.dayIds || opts.dayIds.has(day.id))
    .map((day) => {
      const windows = p.windows
        .filter((x) => x.dayId === day.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((w): ScheduleWindow => {
          const slots = p.slots
            .filter((s) => s.windowId === w.id)
            .sort(byPosition)
            .map((slot): ScheduleSlot => {
              const t = times.slots[slot.id];
              const blocks = p.blocks.filter((b) => b.slotId === slot.id).sort(byBranch);
              const branches = blocks
                .filter((b) => !opts.leaderId || b.leaderId === opts.leaderId)
                .filter((b) => !opts.group || b.groupNames.length === 0 || b.groupNames.includes(opts.group))
                .map((b) => ({
                  dayId: day.id,
                  dayLabel: day.label,
                  date: day.date,
                  windowName: w.name,
                  windowStart: minutesToHhmm(w.startMin),
                  windowEnd: minutesToHhmm(w.endMin),
                  start: minutesToHhmm(t.startMin),
                  end: minutesToHhmm(t.endMin),
                  startMin: t.startMin,
                  durationMin: slot.durationMin,
                  parallel: blocks.length > 1,
                  activity: b.customName || name(p.activities, b.activityId) || "—",
                  description: b.description ?? "",
                  ...categoryColumns(p, b.categories, slot.durationMin),
                  leader: name(p.leaders, b.leaderId),
                  leaderId: b.leaderId,
                  location: name(p.locations, b.locationId),
                  groups: b.groupNames.join(", "),
                  notes: b.notes ?? "",
                }));
              return { start: minutesToHhmm(t.startMin), end: minutesToHhmm(t.endMin), startMin: t.startMin, durationMin: slot.durationMin, branches };
            })
            .filter((s) => s.branches.length > 0);
          return { name: w.name, start: minutesToHhmm(w.startMin), end: minutesToHhmm(w.endMin), slots };
        })
        .filter((w) => w.slots.length > 0);
      return { id: day.id, label: day.label, date: day.date, theme: day.theme, windows };
    });
}

/** One row per block, each day in time order (overlapping windows interleave) -- CSV and Drive sheet. */
export function scheduleRows(p: PlanPayload, opts: ScheduleFilter = {}): ScheduleRow[] {
  return scheduleDays(p, opts).flatMap((d) =>
    d.windows
      .flatMap((w) => w.slots.flatMap((s) => s.branches))
      .sort((a, b) => a.startMin - b.startMin)
  );
}

export const CSV_HEADER = ["Den", "Datum", "Okno", "Začátek okna", "Konec okna", "Začátek", "Konec", "Délka (min)", "Souběžně", "Aktivita", "Popis", "Hlavní kategorie", "Vedlejší kategorie", "Vedoucí", "Místo", "Skupiny", "Poznámka"];
export function rowCells(r: ScheduleRow): (string | number)[] {
  return [r.dayLabel, r.date ?? "", r.windowName, r.windowStart, r.windowEnd, r.start, r.end, r.durationMin, r.parallel ? "ano" : "", r.activity, r.description, r.primaryCategory, r.secondaryCategory, r.leader, r.location, r.groups, r.notes];
}
