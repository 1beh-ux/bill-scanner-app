export type { PlanActivity, PlanPayload } from "@/lib/planning";

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
