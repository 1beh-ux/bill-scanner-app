// Shared shapes for the Planning Helper module (docs/planning-helper-module-design.md).
// Categories, locations, leaders and day templates are EventListItem/ListTemplate
// rows; these are the shapes of their `data` JSON.

import type { ListTemplateKind } from "@/generated/prisma";

// Event-level list kinds. `plan_activity` is deliberately absent: it exists
// only as an org base-library ListTemplate -- event activities are PlanActivity rows.
export const PLAN_EVENT_LIST_KINDS: ListTemplateKind[] = [
  "plan_category",
  "plan_location",
  "plan_leader",
  "plan_day_template",
];
export const PLAN_ORG_LIST_KINDS: ListTemplateKind[] = [...PLAN_EVENT_LIST_KINDS, "plan_activity"];

export type PlanWindowKind = "flexible" | "partial" | "fixed";
export const PLAN_WINDOW_KINDS: PlanWindowKind[] = ["flexible", "partial", "fixed"];

// countInAnalysis (primary categories): false keeps e.g. breakfast/logistics out
// of the time analysis -- see summarize() in planning-engine.ts. Default true.
export type PlanCategoryData = { group?: "primary" | "secondary"; color?: string; targetPercent?: number; countInAnalysis?: boolean };
export type PlanLocationData = { capacity?: number; notes?: string };
export type PlanLeaderData = { role?: string; phone?: string; notes?: string };
// `id` only when editing an existing day's windows (never stored in a template).
export type PlanDayTemplateWindow = { id?: string; name: string; startMin: number; endMin: number; kind: PlanWindowKind };
export type PlanDayTemplateData = { windows?: PlanDayTemplateWindow[] };
// Base library item. Categories are referenced by *name*, resolved against the
// event's plan_category items when imported (event items copied from org
// templates keep the template's name) -- no match leaves the field empty.
export type PlanBaseActivityData = {
  defaultDurationMin?: number;
  description?: string;
  primaryCategoryName?: string;
  secondaryCategoryName?: string;
  energyLevel?: string;
  repeatable?: boolean;
};

export const ENERGY_LEVELS = ["low", "medium", "high"] as const;

export const MIN_SLOT_MINUTES = 5;

export function minutesToHhmm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// "HH:MM" (what <input type="time"> yields) -> minutes; null if malformed.
export function hhmmToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

// ---------------------------------------------------------------------------
// Plan state as sent to the board (GET /api/events/[id]/planning) and used by
// planning-engine.ts / planning-moves.ts. Plain rows, no computed times.

export type PlanDayRow = { id: string; date: string | null; label: string; theme: string | null; notes: string | null; sortOrder: number };
export type PlanWindowRow = {
  id: string;
  dayId: string;
  name: string;
  startMin: number;
  endMin: number;
  kind: PlanWindowKind;
  color: string | null;
  sortOrder: number;
};
export type PlanSlotRow = { id: string; windowId: string; durationMin: number; position: number; notes: string | null };
export type PlanBlockRow = {
  id: string;
  slotId: string;
  branchOrder: number;
  activityId: string | null;
  customName: string | null;
  description: string | null;
  primaryCategoryId: string | null;
  secondaryCategoryId: string | null;
  leaderId: string | null;
  locationId: string | null;
  notes: string | null;
  groupNames: string[]; // empty = everyone
};
export type PlanState = { windows: PlanWindowRow[]; slots: PlanSlotRow[]; blocks: PlanBlockRow[] };

// Shape of GET /api/events/[id]/planning (src/lib/planning-server.ts loadPlanPayload).
export type PlanActivity = {
  id: string;
  name: string;
  defaultDurationMin: number;
  description: string | null;
  primaryCategoryId: string | null;
  secondaryCategoryId: string | null;
  defaultLeaderId: string | null;
  defaultLocationId: string | null;
  repeatable: boolean;
  sourceTemplateId: string | null;
};
export type PlanListItem<D> = { id: string; name: string; data: D | null };

export type PlanPayload = PlanState & {
  event: { id: string; name: string; startDate: string | null; endDate: string | null };
  days: PlanDayRow[];
  activities: PlanActivity[];
  categories: PlanListItem<PlanCategoryData>[];
  locations: PlanListItem<PlanLocationData>[];
  leaders: PlanListItem<PlanLeaderData>[];
  dayTemplates: PlanListItem<PlanDayTemplateData>[];
  baseActivities: PlanListItem<PlanBaseActivityData>[];
  // Distinct Participant.groupName values of the event, plus any still used on blocks.
  groups: string[];
};


// Event.planningSettings JSON.
export type PlanImportTarget = "schedule" | "activities" | "leaders" | "locations" | "categories";
export const PLAN_IMPORT_TARGETS: PlanImportTarget[] = ["schedule", "activities", "leaders", "locations", "categories"];
// mapping: sheet header text -> import field key (by header, not column index,
// so reordered sheet columns still map -- same as the participant import).
export type PlanImportConnection = { sheetId: string; tab?: string; mapping: Record<string, string> };
export type PlanningSettings = {
  imports?: Partial<Record<PlanImportTarget, PlanImportConnection>>;
  exportSheetId?: string;
  exportSyncedAt?: string;
};

/** Name shortened to `max` characters for cards (full name goes in a tooltip). */
export function clipName(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, Math.max(1, max - 1)).trimEnd()}…` : name;
}
