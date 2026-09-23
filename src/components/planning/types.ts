import type {
  PlanBaseActivityData,
  PlanCategoryData,
  PlanDayRow,
  PlanDayTemplateData,
  PlanLeaderData,
  PlanLocationData,
  PlanState,
} from "@/lib/planning";

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
type Item<D> = { id: string; name: string; data: D | null };

export type PlanPayload = PlanState & {
  event: { id: string; name: string; startDate: string | null; endDate: string | null };
  days: PlanDayRow[];
  activities: PlanActivity[];
  categories: Item<PlanCategoryData>[];
  locations: Item<PlanLocationData>[];
  leaders: Item<PlanLeaderData>[];
  dayTemplates: Item<PlanDayTemplateData>[];
  baseActivities: Item<PlanBaseActivityData>[];
};

// dnd-kit `data` payloads.
export type DragData =
  | { type: "slot"; slotId: string; label: string }
  | { type: "block"; blockId: string; label: string }
  | { type: "activity"; activityId: string; label: string }
  | { type: "base"; templateId: string; label: string };
export type DropData =
  | { type: "gap"; windowId: string; index: number }
  | { type: "slot"; slotId: string }
  | { type: "daytab"; dayId: string };

export const PX_PER_MIN = 1.4;
export const MIN_SLOT_PX = 44;
