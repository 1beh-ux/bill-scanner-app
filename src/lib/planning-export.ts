// Flat schedule rows (one per block, in time order) -- the old Export_Schedule
// sheet. Pure; used by the CSV route and the print page.

import { minutesToHhmm, type PlanPayload } from "@/lib/planning";
import { byBranch, byPosition, computeTimes } from "@/lib/planning-engine";

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
  primaryCategory: string;
  secondaryCategory: string;
  leader: string;
  leaderId: string | null;
  location: string;
  groups: string; // comma-separated; empty = everyone
  notes: string;
};

// `group` keeps that group's blocks plus blocks without groups (meant for everyone).
export function scheduleRows(p: PlanPayload, opts: { dayIds?: Set<string>; leaderId?: string; group?: string } = {}): ScheduleRow[] {
  const times = computeTimes(p);
  const name = (list: { id: string; name: string }[], id: string | null) => (id && list.find((x) => x.id === id)?.name) || "";
  const rows: ScheduleRow[] = [];

  for (const day of [...p.days].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (opts.dayIds && !opts.dayIds.has(day.id)) continue;
    for (const w of p.windows.filter((x) => x.dayId === day.id).sort((a, b) => a.sortOrder - b.sortOrder)) {
      for (const slot of p.slots.filter((s) => s.windowId === w.id).sort(byPosition)) {
        const t = times.slots[slot.id];
        const blocks = p.blocks.filter((b) => b.slotId === slot.id).sort(byBranch);
        for (const b of blocks) {
          if (opts.leaderId && b.leaderId !== opts.leaderId) continue;
          if (opts.group && b.groupNames.length > 0 && !b.groupNames.includes(opts.group)) continue;
          rows.push({
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
            primaryCategory: name(p.categories, b.primaryCategoryId),
            secondaryCategory: name(p.categories, b.secondaryCategoryId),
            leader: name(p.leaders, b.leaderId),
            leaderId: b.leaderId,
            location: name(p.locations, b.locationId),
            groups: b.groupNames.join(", "),
            notes: b.notes ?? "",
          });
        }
      }
    }
  }
  // Overlapping windows are possible -- keep each day in time order.
  const dayIndex = new Map(p.days.map((d) => [d.id, d.sortOrder]));
  return rows.sort((a, b) => dayIndex.get(a.dayId)! - dayIndex.get(b.dayId)! || a.startMin - b.startMin);
}
