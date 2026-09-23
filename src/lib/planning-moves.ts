// Every structural edit on the planning board, as a pure transform of PlanState.
// The board applies it optimistically; the server applies the *same* function to
// the stored state and persists the diff (api/events/[id]/planning/ops) -- so the
// ~16 move/copy variants of the original tool live in exactly one place.

import { MIN_SLOT_MINUTES, type PlanBlockRow, type PlanSlotRow, type PlanState } from "@/lib/planning";
import { byBranch, byPosition } from "@/lib/planning-engine";

// A gap in a window (becomes its own slot at that position -- index counts the
// window's current slots, including the dragged one) or an existing slot (joins
// it as a parallel branch).
export type MoveTarget = { windowId: string; index: number } | { slotId: string };
export type BlockFields = Omit<PlanBlockRow, "id" | "slotId" | "branchOrder">;

export type PlanOp =
  | { op: "move"; kind: "slot" | "block"; id: string; target: MoveTarget; copy: boolean }
  | { op: "insert"; target: MoveTarget; durationMin: number; block: BlockFields }
  | { op: "resize"; slotId: string; durationMin: number }
  | { op: "deleteSlot"; slotId: string }
  | { op: "deleteBlock"; blockId: string };

export class PlanOpError extends Error {}

export function applyOp(input: PlanState, op: PlanOp, newId: () => string): PlanState {
  const state: PlanState = {
    windows: input.windows,
    slots: input.slots.map((s) => ({ ...s })),
    blocks: input.blocks.map((b) => ({ ...b })),
  };
  const slot = (id: string) => state.slots.find((s) => s.id === id) ?? fail("slot_not_found");
  const block = (id: string) => state.blocks.find((b) => b.id === id) ?? fail("block_not_found");
  const blocksOf = (slotId: string) => state.blocks.filter((b) => b.slotId === slotId).sort(byBranch);
  const slotsOf = (windowId: string) => state.slots.filter((s) => s.windowId === windowId).sort(byPosition);
  const openWindow = (windowId: string) => {
    const w = state.windows.find((x) => x.id === windowId) ?? fail("window_not_found");
    if (w.kind === "fixed") fail("window_fixed");
    return w;
  };

  const renumberBranches = (slotId: string) => blocksOf(slotId).forEach((b, i) => (b.branchOrder = i));
  const removeSlot = (slotId: string) => {
    const windowId = slot(slotId).windowId;
    state.slots = state.slots.filter((s) => s.id !== slotId);
    state.blocks = state.blocks.filter((b) => b.slotId !== slotId);
    slotsOf(windowId).forEach((s, i) => (s.position = i));
  };
  // Places `slotId` at gap `index` of `windowId`, index counted with the slot
  // itself still in its old place (what the user saw while dragging).
  const placeSlot = (slotId: string, windowId: string, index: number) => {
    const moved = slot(slotId);
    const fromWindow = moved.windowId;
    const ids = slotsOf(windowId).map((s) => s.id);
    ids.splice(Math.max(0, Math.min(index, ids.length)), 0, "\u0000");
    const order = ids.filter((id) => id !== slotId).map((id) => (id === "\u0000" ? slotId : id));
    moved.windowId = windowId;
    order.forEach((id, i) => (slot(id).position = i));
    if (fromWindow !== windowId) slotsOf(fromWindow).forEach((s, i) => (s.position = i));
  };
  const newSlot = (windowId: string, durationMin: number, notes: string | null = null): PlanSlotRow => {
    const s = { id: newId(), windowId, durationMin, position: Number.MAX_SAFE_INTEGER, notes };
    state.slots.push(s);
    return s;
  };
  const addBlock = (slotId: string, fields: BlockFields) =>
    state.blocks.push({ ...fields, id: newId(), slotId, branchOrder: blocksOf(slotId).length });

  switch (op.op) {
    case "resize": {
      const d = Math.round(op.durationMin);
      if (!Number.isFinite(d)) fail("invalid_duration");
      slot(op.slotId).durationMin = Math.max(MIN_SLOT_MINUTES, Math.min(24 * 60, d));
      return state;
    }

    case "deleteSlot":
      slot(op.slotId);
      removeSlot(op.slotId);
      return state;

    case "deleteBlock": {
      const b = block(op.blockId);
      state.blocks = state.blocks.filter((x) => x.id !== b.id);
      if (blocksOf(b.slotId).length === 0) removeSlot(b.slotId);
      else renumberBranches(b.slotId);
      return state;
    }

    case "insert": {
      const duration = Math.max(MIN_SLOT_MINUTES, Math.round(op.durationMin));
      if ("slotId" in op.target) {
        openWindow(slot(op.target.slotId).windowId);
        addBlock(op.target.slotId, op.block);
      } else {
        openWindow(op.target.windowId);
        const s = newSlot(op.target.windowId, duration);
        addBlock(s.id, op.block);
        placeSlot(s.id, op.target.windowId, op.target.index);
      }
      return state;
    }

    case "move": {
      const { target, copy } = op;
      const targetWindowId = "slotId" in target ? slot(target.slotId).windowId : target.windowId;
      openWindow(targetWindowId);

      if (op.kind === "slot") {
        const src = slot(op.id);
        if ("slotId" in target) {
          // Whole slot onto another slot: its branches join that slot.
          if (target.slotId === src.id) return input;
          for (const b of blocksOf(src.id)) {
            if (copy) addBlock(target.slotId, fieldsOf(b));
            else {
              b.branchOrder = blocksOf(target.slotId).length;
              b.slotId = target.slotId;
            }
          }
          if (!copy) removeSlot(src.id);
          return state;
        }
        if (copy) {
          const s = newSlot(target.windowId, src.durationMin, src.notes);
          for (const b of blocksOf(src.id)) addBlock(s.id, fieldsOf(b));
          placeSlot(s.id, target.windowId, target.index);
        } else {
          placeSlot(src.id, target.windowId, target.index);
        }
        return state;
      }

      // Single branch.
      const b = block(op.id);
      const srcSlot = slot(b.slotId);
      const leavesEmpty = !copy && blocksOf(srcSlot.id).length === 1;
      if ("slotId" in target) {
        if (target.slotId === srcSlot.id) return input;
        if (copy) addBlock(target.slotId, fieldsOf(b));
        else {
          b.branchOrder = blocksOf(target.slotId).length;
          b.slotId = target.slotId;
          if (leavesEmpty) removeSlot(srcSlot.id);
          else renumberBranches(srcSlot.id);
        }
        return state;
      }
      // Branch into a gap: becomes its own slot, keeping the source slot's duration.
      if (leavesEmpty) {
        // Only branch -> this is just moving the slot.
        placeSlot(srcSlot.id, target.windowId, target.index);
        return state;
      }
      const s = newSlot(target.windowId, srcSlot.durationMin);
      if (copy) addBlock(s.id, fieldsOf(b));
      else {
        b.slotId = s.id;
        b.branchOrder = 0;
        renumberBranches(srcSlot.id);
      }
      placeSlot(s.id, target.windowId, target.index);
      return state;
    }
  }
}

export function fieldsOf(b: PlanBlockRow): BlockFields {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, slotId, branchOrder, ...fields } = b;
  return fields;
}

function fail(code: string): never {
  throw new PlanOpError(code);
}
