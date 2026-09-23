"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import type { PlanState } from "@/lib/planning";
import { computeTimes, findConflicts } from "@/lib/planning-engine";
import { applyOp, PlanOpError, type BlockFields, type MoveTarget, type PlanOp } from "@/lib/planning-moves";
import BlockEditor from "./BlockEditor";
import DayPlan from "./DayPlan";
import DayTabs from "./DayTabs";
import LibraryPanel from "./LibraryPanel";
import SummaryPanel from "./SummaryPanel";
import type { DragData, DropData, PlanPayload } from "./types";

// Pointer-based when there is a pointer (so dropping over nothing does
// nothing); nearest droppable for keyboard dragging.
const collision: CollisionDetection = (args) => (args.pointerCoordinates ? pointerWithin(args) : closestCenter(args));
const DAY_TAB_HOVER_MS = 600;
const stateOf = (p: PlanPayload): PlanState => ({ windows: p.windows, slots: p.slots, blocks: p.blocks });
const isCopyGesture = (e: Event | null | undefined) =>
  !!e && ("altKey" in e) && ((e as KeyboardEvent).altKey || (e as KeyboardEvent).ctrlKey || (e as KeyboardEvent).metaKey);

// Body sent to POST /planning/ops -- library drops send a source instead of block fields.
type ServerOp = Exclude<PlanOp, { op: "insert" }> | { op: "insert"; target: MoveTarget; source: { activityId: string } | { baseTemplateId: string } };

export default function PlanningBoard({ eventId }: { eventId: string }) {
  const { t } = useTranslations();
  const confirm = useConfirm();
  const [payload, setPayload] = useState<PlanPayload | null>(null);
  const payloadRef = useRef<PlanPayload | null>(null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [resizePreview, setResizePreview] = useState<{ slotId: string; durationMin: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null);
  const [copyMode, setCopyMode] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const commit = useCallback((next: PlanPayload, selectDayId?: string) => {
    payloadRef.current = next;
    setPayload(next);
    setSelectedDayId((cur) => {
      const want = selectDayId ?? cur;
      return want && next.days.some((d) => d.id === want) ? want : ([...next.days].sort((a, b) => a.sortOrder - b.sortOrder)[0]?.id ?? null);
    });
  }, []);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/events/${eventId}/planning`);
    if (res.ok) commit(await res.json());
    else setError(t("planBoard.errorLoad"));
  }, [eventId, commit, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; state is set after the await
    reload();
  }, [reload]);

  // Optimistic: apply locally, then send; the server answers with the fresh
  // payload, adopted once no later op is still in flight.
  function runOp(serverOp: ServerOp, local: PlanOp) {
    const current = payloadRef.current;
    if (!current) return;
    try {
      commit({ ...current, ...applyOp(stateOf(current), local, () => `tmp-${crypto.randomUUID()}`) });
    } catch (err) {
      if (err instanceof PlanOpError) setError(t(err.message === "window_fixed" ? "planBoard.errorFixedWindow" : "planBoard.errorStale"));
      return;
    }
    pending.current++;
    queue.current = queue.current.then(async () => {
      const res = await fetch(`/api/events/${eventId}/planning/ops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serverOp),
      }).catch(() => null);
      const next = res?.ok ? ((await res.json()) as PlanPayload) : null;
      pending.current--;
      if (!next) {
        setError(t("planBoard.errorStale"));
        if (pending.current === 0) await reload();
      } else if (pending.current === 0) {
        commit(next);
      }
    });
  }

  // ---- drag & drop ---------------------------------------------------------
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  // Alt / Ctrl / Cmd held while dropping = copy instead of move.
  useEffect(() => {
    if (!activeDrag) return;
    const update = (e: KeyboardEvent | MouseEvent) => setCopyMode(e.altKey || e.ctrlKey || e.metaKey);
    window.addEventListener("keydown", update);
    window.addEventListener("keyup", update);
    window.addEventListener("mousemove", update);
    return () => {
      window.removeEventListener("keydown", update);
      window.removeEventListener("keyup", update);
      window.removeEventListener("mousemove", update);
    };
  }, [activeDrag]);

  function clearHover() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }

  function onDragStart(e: DragStartEvent) {
    setError(null);
    setActiveDrag(e.active.data.current as DragData);
    setCopyMode(isCopyGesture(e.activatorEvent));
  }

  // Hovering a day tab while dragging switches to that day, so items can be
  // dropped at an exact spot on another day.
  function onDragOver(e: DragOverEvent) {
    clearHover();
    const over = e.over?.data.current as DropData | undefined;
    if (over?.type === "daytab" && over.dayId !== selectedDayId) {
      hoverTimer.current = setTimeout(() => setSelectedDayId(over.dayId), DAY_TAB_HOVER_MS);
    }
  }

  function windowNameOf(drag: DragData) {
    const p = payloadRef.current!;
    const slotId = drag.type === "slot" ? drag.slotId : drag.type === "block" ? p.blocks.find((b) => b.id === drag.blockId)?.slotId : undefined;
    const windowId = p.slots.find((s) => s.id === slotId)?.windowId;
    return p.windows.find((w) => w.id === windowId)?.name;
  }

  // Dropped straight on a day tab: end of the same-named window, else the first open one.
  function appendTarget(dayId: string, windowName?: string): MoveTarget | null {
    const p = payloadRef.current!;
    const open = p.windows.filter((w) => w.dayId === dayId && w.kind !== "fixed").sort((a, b) => a.sortOrder - b.sortOrder);
    const w = open.find((x) => x.name === windowName) ?? open[0];
    return w ? { windowId: w.id, index: p.slots.filter((s) => s.windowId === w.id).length } : null;
  }

  function onDragEnd(e: DragEndEvent) {
    clearHover();
    const drag = e.active.data.current as DragData | undefined;
    const drop = e.over?.data.current as DropData | undefined;
    const copy = copyMode;
    setActiveDrag(null);
    setCopyMode(false);
    const p = payloadRef.current;
    if (!drag || !drop || !p) return;

    const target: MoveTarget | null =
      drop.type === "gap" ? { windowId: drop.windowId, index: drop.index } : drop.type === "slot" ? { slotId: drop.slotId } : appendTarget(drop.dayId, windowNameOf(drag));
    if (!target) {
      setError(t("planBoard.errorNoWindow"));
      return;
    }

    if (drag.type === "slot" || drag.type === "block") {
      // Dropped onto its own slot: nothing to do.
      const ownSlotId = drag.type === "slot" ? drag.slotId : p.blocks.find((b) => b.id === drag.blockId)?.slotId;
      if ("slotId" in target && target.slotId === ownSlotId) return;
      const op: PlanOp = { op: "move", kind: drag.type, id: drag.type === "slot" ? drag.slotId : drag.blockId, target, copy };
      runOp(op, op);
      return;
    }

    // Library drop -> new slot or new parallel branch. The local block mirrors
    // what the server builds (api/.../planning/ops resolveInsert).
    const empty: BlockFields = {
      activityId: null, customName: null, description: null, primaryCategoryId: null,
      secondaryCategoryId: null, leaderId: null, locationId: null, notes: null,
    };
    if (drag.type === "activity") {
      const a = p.activities.find((x) => x.id === drag.activityId);
      if (!a) return;
      runOp(
        { op: "insert", target, source: { activityId: a.id } },
        {
          op: "insert",
          target,
          durationMin: a.defaultDurationMin,
          block: {
            ...empty,
            activityId: a.id,
            description: a.description,
            primaryCategoryId: a.primaryCategoryId,
            secondaryCategoryId: a.secondaryCategoryId,
            leaderId: a.defaultLeaderId,
            locationId: a.defaultLocationId,
          },
        }
      );
    } else {
      const base = p.baseActivities.find((x) => x.id === drag.templateId);
      if (!base) return;
      runOp(
        { op: "insert", target, source: { baseTemplateId: base.id } },
        { op: "insert", target, durationMin: base.data?.defaultDurationMin ?? 30, block: { ...empty, customName: base.name } }
      );
    }
  }

  async function deleteSlot(slotId: string) {
    if (!(await confirm({ message: t("planBoard.confirmDeleteSlot"), danger: true }))) return;
    const op: PlanOp = { op: "deleteSlot", slotId };
    runOp(op, op);
  }

  async function deleteBlock(blockId: string) {
    if (!(await confirm({ message: t("planBoard.confirmDeleteBlock"), danger: true }))) return;
    const op: PlanOp = { op: "deleteBlock", blockId };
    runOp(op, op);
  }

  function commitResize(slotId: string, durationMin: number) {
    const op: PlanOp = { op: "resize", slotId, durationMin };
    runOp(op, op);
    setResizePreview(null);
  }

  // ---- derived view ---------------------------------------------------------
  const view = useMemo(() => {
    if (!payload || !resizePreview) return payload;
    return {
      ...payload,
      slots: payload.slots.map((s) => (s.id === resizePreview.slotId ? { ...s, durationMin: resizePreview.durationMin } : s)),
    };
  }, [payload, resizePreview]);
  const plan = useMemo(() => (view ? stateOf(view) : null), [view]);
  const times = useMemo(() => (plan ? computeTimes(plan) : null), [plan]);
  const conflicts = useMemo(() => {
    if (!plan) return [];
    const dayOf = new Map(plan.windows.map((w) => [w.id, w.dayId]));
    return findConflicts(plan, (windowId) => dayOf.get(windowId));
  }, [plan]);
  const conflictBlockIds = useMemo(() => new Set(conflicts.flatMap((c) => c.blockIds)), [conflicts]);

  if (!view || !plan || !times) {
    return <div className="p-4 text-[14px] text-ink-secondary md:p-8">{error ?? t("common.loading")}</div>;
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[22px] font-semibold text-ink">
          {view.event.name} — {t("nav.planning")}
        </h1>
        <p className="text-[12px] text-ink-secondary">{t("planBoard.copyHint")}</p>
      </div>

      {error && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-[12px] hover:underline">
            {t("common.close")}
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          clearHover();
          setActiveDrag(null);
          setCopyMode(false);
        }}
      >
        <DayTabs
          eventId={eventId}
          payload={view}
          selectedDayId={selectedDayId}
          onSelect={setSelectedDayId}
          onPayload={commit}
          onError={setError}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[230px_minmax(0,1fr)_260px]">
          <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
            <LibraryPanel payload={view} eventId={eventId} />
          </div>

          <div className="min-w-0">
            {selectedDayId ? (
              <DayPlan
                payload={view}
                dayId={selectedDayId}
                times={times}
                conflictBlockIds={conflictBlockIds}
                onResizePreview={(slotId, durationMin) => setResizePreview(durationMin === null ? null : { slotId, durationMin })}
                onResizeCommit={commitResize}
                onDeleteSlot={deleteSlot}
                onDeleteBlock={deleteBlock}
                onEditBlock={setEditingBlockId}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-mist p-8 text-center text-[14px] text-ink-secondary">
                <p>{t("planBoard.noDays")}</p>
                {view.dayTemplates.length === 0 && <p className="mt-2 text-[12px]">{t("planBoard.noTemplatesHint")}</p>}
              </div>
            )}
          </div>

          <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
            <SummaryPanel eventId={eventId} payload={view} plan={plan} dayId={selectedDayId} conflicts={conflicts} />
          </div>
        </div>

        {editingBlockId && (
          <BlockEditor
            key={editingBlockId}
            eventId={eventId}
            payload={view}
            blockId={editingBlockId}
            time={times.slots[view.blocks.find((b) => b.id === editingBlockId)?.slotId ?? ""]}
            onClose={() => setEditingBlockId(null)}
            onSaved={(next) => commit(next)}
            onResize={commitResize}
            onDelete={deleteBlock}
          />
        )}

        <DragOverlay dropAnimation={null}>
          {activeDrag && (
            <div className="flex max-w-[260px] items-center gap-2 rounded-md border border-ember bg-paper px-3 py-2 text-[13px] font-medium text-ink shadow-lg">
              {copyMode && <span className="rounded bg-ember px-1.5 text-[11px] font-semibold text-white">+ {t("planBoard.copyBadge")}</span>}
              <span className="truncate">{activeDrag.label}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
