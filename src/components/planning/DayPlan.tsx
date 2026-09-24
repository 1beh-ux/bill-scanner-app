"use client";

import { useEffect, useRef, useState } from "react";
import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronDown, ChevronRight, GripVertical, Trash2, X } from "lucide-react";
import { useTranslations } from "@/lib/i18n";
import type { UiPrefs } from "@/lib/ui-prefs";
import { MIN_SLOT_MINUTES, clipName, minutesToHhmm, type PlanBlockRow, type PlanSlotRow, type PlanWindowRow } from "@/lib/planning";
import { byBranch, byPosition, mainCategorySegments, type ComputedSlot, type ComputedWindow } from "@/lib/planning-engine";
import CategoryBar from "./CategoryBar";
import { MIN_SLOT_PX, PX_PER_MIN, type DragData, type DropData, type PlanPayload } from "./types";

export type DayPlanProps = {
  payload: PlanPayload;
  dayId: string;
  times: { slots: Record<string, ComputedSlot>; windows: Record<string, ComputedWindow> };
  conflictBlockIds: Set<string>;
  onResizePreview: (slotId: string, durationMin: number | null) => void;
  onResizeCommit: (slotId: string, durationMin: number) => void;
  onDeleteSlot: (slotId: string) => void;
  onDeleteBlock: (blockId: string) => void;
  onEditBlock: (blockId: string) => void;
  cardPrefs: Required<UiPrefs>;
};

export function blockLabel(payload: PlanPayload, b: PlanBlockRow) {
  return b.customName || payload.activities.find((a) => a.id === b.activityId)?.name || "—";
}

const COLLAPSED_KEY = "planning.collapsedWindows";

// Collapsed windows are a per-viewer convenience (localStorage, per window id).
function useCollapsedWindows() {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore after mount so SSR and client agree
      setCollapsed(new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]")));
    } catch {}
  }, []);
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  return { collapsed, toggle };
}

/** A time range, formatted the same everywhere on the board: "09:00 – 12:00". */
function TimeRange({ start, end }: { start: number; end: number }) {
  return (
    <span className="whitespace-nowrap rounded-md border border-mist bg-paper px-1.5 py-0.5 text-[12.5px] font-semibold tabular-nums text-ink">
      {minutesToHhmm(start)} – {minutesToHhmm(end)}
    </span>
  );
}

export default function DayPlan(props: DayPlanProps) {
  const { t } = useTranslations();
  const { collapsed, toggle } = useCollapsedWindows();
  const windows = props.payload.windows.filter((w) => w.dayId === props.dayId).sort((a, b) => a.sortOrder - b.sortOrder);

  if (windows.length === 0) {
    return <p className="rounded-lg border border-dashed border-mist p-6 text-center text-[14px] text-ink-secondary">{t("planBoard.noWindows")}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {windows.map((w) => (
        <WindowCard key={w.id} window={w} collapsed={collapsed.has(w.id)} onToggle={() => toggle(w.id)} {...props} />
      ))}
    </div>
  );
}

function WindowCard({
  window: w,
  collapsed,
  onToggle,
  ...props
}: DayPlanProps & { window: PlanWindowRow; collapsed: boolean; onToggle: () => void }) {
  const { t } = useTranslations();
  const cw = props.times.windows[w.id];
  const slots = props.payload.slots.filter((s) => s.windowId === w.id).sort(byPosition);
  // The header is a drop target too: dropping on it appends to the window -- the
  // only way in while it's collapsed.
  const headerDrop: DropData = { type: "gap", windowId: w.id, index: slots.length };
  const { setNodeRef: setHeaderRef, isOver: headerOver } = useDroppable({ id: `winhead:${w.id}`, data: headerDrop, disabled: w.kind === "fixed" });

  if (w.kind === "fixed") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg bg-mist/50 px-3 py-2 text-[13px] text-ink-secondary">
        <span className="font-medium">{w.name}</span>
        <TimeRange start={w.startMin} end={w.endMin} />
      </div>
    );
  }

  const over = (cw?.overflowMin ?? 0) > 0;
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <section className={"rounded-lg border bg-paper-2 " + (over ? "border-red-400" : "border-mist")}>
      <header
        ref={setHeaderRef}
        className={
          "flex flex-wrap items-center justify-between gap-2 px-3 py-2 " +
          (collapsed ? "" : "border-b border-mist ") +
          (headerOver ? "rounded-t-lg bg-ember/10" : "")
        }
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          title={t(collapsed ? "planBoard.expandWindow" : "planBoard.collapseWindow")}
          className="flex items-center gap-2 text-left"
        >
          <Chevron size={16} className="shrink-0 text-ink-secondary" aria-hidden="true" />
          <h3 className="text-[14px] font-semibold text-ink">{w.name}</h3>
          <TimeRange start={w.startMin} end={w.endMin} />
          {collapsed && <span className="text-[12px] text-ink-secondary">{t("planBoard.windowSlotCount", { count: String(slots.length) })}</span>}
        </button>
        <span className={"text-[12px] " + (over ? "font-medium text-red-600" : "text-ink-secondary")}>
          {w.kind === "flexible"
            ? over
              ? t("planBoard.overflow", { used: String(cw?.usedMin ?? 0), capacity: String(cw?.capacityMin ?? 0), over: String(cw?.overflowMin ?? 0) })
              : t("planBoard.usage", { used: String(cw?.usedMin ?? 0), capacity: String(cw?.capacityMin ?? 0) })
            : t("planBoard.usagePartial", { used: String(cw?.usedMin ?? 0) })}
        </span>
      </header>
      <div className={"px-2 py-1" + (collapsed ? " hidden" : "")}>
        {slots.length === 0 ? (
          <Gap windowId={w.id} index={0} empty />
        ) : (
          slots.map((s, i) => (
            <div key={s.id}>
              <Gap windowId={w.id} index={i} />
              <SlotCard slot={s} {...props} />
              {i === slots.length - 1 && <Gap windowId={w.id} index={slots.length} />}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function Gap({ windowId, index, empty }: { windowId: string; index: number; empty?: boolean }) {
  const { t } = useTranslations();
  const data: DropData = { type: "gap", windowId, index };
  const { setNodeRef, isOver } = useDroppable({ id: `gap:${windowId}:${index}`, data });
  const { active } = useDndContext();

  if (empty) {
    return (
      <div
        ref={setNodeRef}
        className={
          "my-1 rounded-md border border-dashed p-4 text-center text-[13px] " +
          (isOver ? "border-ember bg-ember/10 text-ink" : "border-mist text-ink-secondary")
        }
      >
        {t("planBoard.dropHere")}
      </div>
    );
  }
  return (
    <div ref={setNodeRef} className={"relative " + (active ? "h-4" : "h-1.5")}>
      {isOver && <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-ember" />}
    </div>
  );
}

function SlotCard({ slot, ...props }: DayPlanProps & { slot: PlanSlotRow }) {
  const { t } = useTranslations();
  const blocks = props.payload.blocks.filter((b) => b.slotId === slot.id).sort(byBranch);
  const time = props.times.slots[slot.id];
  const label = blocks.map((b) => blockLabel(props.payload, b)).join(" | ");

  const dragData: DragData = { type: "slot", slotId: slot.id, label };
  const { setNodeRef: setDragRef, listeners, attributes, isDragging } = useDraggable({ id: `drag-slot:${slot.id}`, data: dragData });
  const dropData: DropData = { type: "slot", slotId: slot.id };
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `onslot:${slot.id}`, data: dropData });

  const resize = useRef<{ startY: number; startMin: number; current: number } | null>(null);
  function onResizeDown(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resize.current = { startY: e.clientY, startMin: slot.durationMin, current: slot.durationMin };
  }
  function onResizeMove(e: React.PointerEvent) {
    const r = resize.current;
    if (!r) return;
    const next = Math.max(MIN_SLOT_MINUTES, Math.round((r.startMin + (e.clientY - r.startY) / PX_PER_MIN) / 5) * 5);
    if (next !== r.current) {
      r.current = next;
      props.onResizePreview(slot.id, next);
    }
  }
  function onResizeUp() {
    const r = resize.current;
    resize.current = null;
    if (!r) return;
    if (r.current !== r.startMin) props.onResizeCommit(slot.id, r.current);
    else props.onResizePreview(slot.id, null);
  }

  return (
    <div
      ref={setDropRef}
      style={{ minHeight: Math.max(MIN_SLOT_PX, slot.durationMin * PX_PER_MIN) }}
      className={
        "group relative flex rounded-md border bg-paper transition-shadow " +
        (isOver && !isDragging ? "border-ember ring-2 ring-ember/40 " : "border-mist ") +
        (isDragging ? "opacity-40" : "")
      }
    >
      <div
        ref={setDragRef}
        {...listeners}
        {...attributes}
        aria-label={t("planBoard.dragSlot")}
        className={
          "flex w-[74px] shrink-0 cursor-grab touch-manipulation flex-col items-start gap-0.5 border-r border-mist px-2 py-1.5 active:cursor-grabbing " +
          (time?.overflow ? "text-red-600" : "text-ink")
        }
      >
        {/* Start and end formatted alike; overflow turns both red (via the parent). */}
        <span className="flex items-center gap-0.5 text-[12.5px] font-semibold tabular-nums">
          <GripVertical size={12} className="-ml-1 text-ink-secondary" aria-hidden="true" />
          {time ? minutesToHhmm(time.startMin) : ""}
        </span>
        <span className="pl-[11px] text-[12.5px] font-semibold tabular-nums">{time ? minutesToHhmm(time.endMin) : ""}</span>
        <span className="pl-[11px] text-[11px] font-normal text-ink-secondary">{slot.durationMin} min</span>
      </div>

      <div className="flex min-w-0 flex-1 gap-1.5 p-1.5">
        {blocks.map((b) => (
          <BranchCard key={b.id} block={b} {...props} />
        ))}
      </div>

      {blocks.length > 1 && (
        <button
          onClick={() => props.onDeleteSlot(slot.id)}
          className="absolute right-1 top-1 hidden rounded p-1 text-ink-secondary hover:bg-mist hover:text-red-600 group-hover:block"
          aria-label={t("planBoard.deleteSlot")}
          title={t("planBoard.deleteSlot")}
        >
          <Trash2 size={13} />
        </button>
      )}

      <div
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
        className="absolute inset-x-0 -bottom-1 h-2.5 cursor-ns-resize touch-none"
        aria-label={t("planBoard.resize")}
        title={t("planBoard.resize")}
      >
        <div className="mx-auto mt-1 hidden h-1 w-10 rounded-full bg-ink-secondary/50 group-hover:block" />
      </div>
    </div>
  );
}

function BranchCard({ block: b, ...props }: DayPlanProps & { block: PlanBlockRow }) {
  const { t } = useTranslations();
  const { payload } = props;
  const label = blockLabel(payload, b);
  const dragData: DragData = { type: "block", blockId: b.id, label };
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `drag-block:${b.id}`, data: dragData });

  const slotDuration = payload.slots.find((s) => s.id === b.slotId)?.durationMin ?? 0;
  const segments = mainCategorySegments(payload.categories, b.categories, slotDuration);
  const leader = payload.leaders.find((l) => l.id === b.leaderId)?.name;
  const location = payload.locations.find((l) => l.id === b.locationId)?.name;
  const conflict = props.conflictBlockIds.has(b.id);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => props.onEditBlock(b.id)}
      title={conflict ? t("planBoard.conflictHint") : undefined}
      className={
        "group/branch relative min-w-0 flex-1 cursor-grab touch-manipulation rounded border bg-paper-2 py-1 pl-3 pr-2 active:cursor-grabbing " +
        (conflict ? "border-red-400 ring-1 ring-red-400 " : "border-mist ") +
        (isDragging ? "opacity-40" : "")
      }
    >
      <CategoryBar segments={segments} />
      {/* Name always in full; the rest per the user's card settings (Nastavení -> Plánování). */}
      <div className="break-words pr-4 text-[13px] font-medium leading-snug text-ink">{label}</div>
      {props.cardPrefs.planningCardShowDescription && b.description && (
        <div className="break-words text-[11.5px] leading-snug text-ink-secondary" title={b.description}>
          {clipName(b.description, props.cardPrefs.planningCardDescriptionChars)}
        </div>
      )}
      {props.cardPrefs.planningCardShowMeta && (leader || location) && (
        <div className="truncate text-[11.5px] italic text-ink-secondary">{[leader, location].filter(Boolean).join(" · ")}</div>
      )}
      {props.cardPrefs.planningCardShowGroups && b.groupNames.length > 0 && (
        <div className="truncate text-[11px] font-medium text-ember">{b.groupNames.join(", ")}</div>
      )}
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          props.onDeleteBlock(b.id);
        }}
        className="absolute right-0.5 top-0.5 hidden rounded p-0.5 text-ink-secondary hover:bg-mist hover:text-red-600 group-hover/branch:block"
        aria-label={t("planBoard.deleteBlock")}
        title={t("planBoard.deleteBlock")}
      >
        <X size={12} />
      </button>
    </div>
  );
}
