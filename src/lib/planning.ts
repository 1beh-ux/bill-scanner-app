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

export type PlanCategoryData = { group?: "primary" | "secondary"; color?: string; targetPercent?: number };
export type PlanLocationData = { capacity?: number; notes?: string };
export type PlanLeaderData = { role?: string; phone?: string; notes?: string };
export type PlanDayTemplateWindow = { name: string; startMin: number; endMin: number; kind: PlanWindowKind };
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
