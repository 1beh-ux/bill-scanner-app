"use client";

import { useRef, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { MIN_SLOT_MINUTES, minutesToHhmm, type PlanBlockRow, type PlanPayload } from "@/lib/planning";
import { byPosition, computeTimes, type ComputedSlot } from "@/lib/planning-engine";
import type { MoveTarget } from "@/lib/planning-moves";
import { blockLabel } from "./DayPlan";

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const labelClass = "flex flex-col gap-1 text-[12px] text-ink-secondary";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

type Fields = Pick<
  PlanBlockRow,
  "activityId" | "customName" | "description" | "primaryCategoryId" | "secondaryCategoryId" | "leaderId" | "locationId" | "notes" | "groupNames"
>;

// Side panel for one scheduled block (step 6). Fields are the block's own
// snapshot; picking another activity refills them from that activity's
// defaults, like the original tool did.
export default function BlockEditor({
  eventId,
  payload,
  blockId,
  time,
  onClose,
  onSaved,
  onResize,
  onDelete,
  onMove,
}: {
  eventId: string;
  payload: PlanPayload;
  blockId: string;
  time: ComputedSlot | undefined;
  onClose: () => void;
  onSaved: (next: PlanPayload) => void;
  onResize: (slotId: string, durationMin: number) => void;
  onDelete: (blockId: string) => void;
  onMove: (blockId: string, target: MoveTarget, copy: boolean) => void;
}) {
  const { t } = useTranslations();
  const block = payload.blocks.find((b) => b.id === blockId);
  const slot = payload.slots.find((s) => s.id === block?.slotId);
  const [fields, setFields] = useState<Fields | null>(() =>
    block
      ? {
          activityId: block.activityId,
          customName: block.customName,
          description: block.description,
          primaryCategoryId: block.primaryCategoryId,
          secondaryCategoryId: block.secondaryCategoryId,
          leaderId: block.leaderId,
          locationId: block.locationId,
          notes: block.notes,
          groupNames: block.groupNames,
        }
      : null
  );
  const [duration, setDuration] = useState(slot?.durationMin ?? 30);
  // One editable name: the block's own name, else the library activity's.
  const [name, setName] = useState(() => block?.customName || payload.activities.find((a) => a.id === block?.activityId)?.name || "");
  const nameRef = useRef<HTMLTextAreaElement>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const ownDayId = payload.windows.find((w) => w.id === slot?.windowId)?.dayId ?? "";
  const [moveDayId, setMoveDayId] = useState(ownDayId);
  const [moveTarget, setMoveTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!block || !slot || !fields) return null;
  const activity = payload.activities.find((a) => a.id === fields.activityId);
  const set = (patch: Partial<Fields>) => setFields({ ...fields, ...patch });

  // Imported names often carry their detail text too: cut the selected part of
  // the name into the description.
  function moveSelectionToDescription() {
    const el = nameRef.current;
    if (!el || el.selectionStart === el.selectionEnd) return;
    const moved = name.slice(el.selectionStart, el.selectionEnd).trim();
    setName((name.slice(0, el.selectionStart) + name.slice(el.selectionEnd)).replace(/\s+/g, " ").replace(/[\s,;:–-]+$/, "").trim());
    set({ description: [moved, fields!.description].filter(Boolean).join("\n") });
    setHasSelection(false);
  }

  async function save(then?: () => void) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/events/${eventId}/planning/blocks/${blockId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // Same as the library name -> store nothing, so the block keeps following the activity.
      body: JSON.stringify({ ...fields, customName: name.trim() && name.trim() !== activity?.name ? name.trim() : null }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(t("planBoard.errorSaveFailed"));
      return;
    }
    onSaved(await res.json());
    if (duration !== slot!.durationMin && duration >= MIN_SLOT_MINUTES) onResize(slot!.id, duration);
    then?.();
    onClose();
  }

  const select = (key: keyof Fields, items: { id: string; name: string }[], label: string) => (
    <label className={labelClass}>
      {label}
      <select value={(fields[key] as string | null) ?? ""} onChange={(e) => set({ [key]: e.target.value || null })} className={inputClass}>
        <option value="">—</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
    </label>
  );
  // Move/copy targets for the chosen day: start of each open window, then
  // "parallel with" and "after" every slot -- the same targets drag & drop has.
  const times = computeTimes(payload);
  const moveOptions = payload.windows
    .filter((w) => w.dayId === moveDayId && w.kind !== "fixed")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((w) => {
      const slots = payload.slots.filter((s) => s.windowId === w.id).sort(byPosition);
      const label = (slotId: string) =>
        `${minutesToHhmm(times.slots[slotId]?.startMin ?? 0)} ${payload.blocks
          .filter((b) => b.slotId === slotId)
          .map((b) => blockLabel(payload, b))
          .join(" | ")}`;
      const options: { value: string; label: string }[] = [
        { value: JSON.stringify({ windowId: w.id, index: 0 }), label: t(slots.length ? "planBoard.moveStartOf" : "planBoard.moveInto", { window: w.name }) },
      ];
      slots.forEach((s, i) => {
        if (s.id !== slot.id) options.push({ value: JSON.stringify({ slotId: s.id }), label: t("planBoard.moveWith", { slot: label(s.id) }) });
        options.push({ value: JSON.stringify({ windowId: w.id, index: i + 1 }), label: t("planBoard.moveAfter", { slot: label(s.id) }) });
      });
      return { window: w, options };
    });
  const move = (copy: boolean) => {
    if (!moveTarget) return;
    const target = JSON.parse(moveTarget) as MoveTarget;
    save(() => onMove(blockId, target, copy));
  };

  const categories = (group: "primary" | "secondary") => payload.categories.filter((c) => (c.data?.group ?? "primary") === group);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col gap-3 overflow-y-auto bg-paper p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[17px] font-semibold text-ink">{t("planBoard.editActivity")}</h2>
          {time && (
            <span className="text-[13px] text-ink-secondary">
              {minutesToHhmm(time.startMin)}–{minutesToHhmm(time.endMin)}
            </span>
          )}
        </div>

        <label className={labelClass}>
          {t("planBoard.activityName")}
          <textarea
            ref={nameRef}
            value={name}
            rows={2}
            onChange={(e) => setName(e.target.value.replace(/\n/g, " "))}
            onSelect={(e) => setHasSelection(e.currentTarget.selectionStart !== e.currentTarget.selectionEnd)}
            className={inputClass}
          />
        </label>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()} // keep the text selection
          onClick={moveSelectionToDescription}
          disabled={!hasSelection}
          className="-mt-1.5 self-start text-[12.5px] text-ember hover:underline disabled:text-ink-secondary disabled:no-underline"
        >
          {t("planBoard.moveToDescription")}
        </button>
        {activity && name.trim() !== activity.name && (
          <p className="-mt-1.5 text-[11.5px] text-ink-secondary">{t("planBoard.libraryName", { name: activity.name })}</p>
        )}
        <label className={labelClass}>
          {t("planBoard.slotDuration")}
          <input
            type="number"
            min={MIN_SLOT_MINUTES}
            step={5}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className={inputClass}
          />
          {payload.blocks.filter((b) => b.slotId === slot.id).length > 1 && (
            <span className="text-[11.5px]">{t("planBoard.slotDurationShared")}</span>
          )}
        </label>
        <div className="grid grid-cols-2 gap-3">
          {select("primaryCategoryId", categories("primary"), t("planLists.primaryCategory"))}
          {select("secondaryCategoryId", categories("secondary"), t("planLists.secondaryCategory"))}
          {select("leaderId", payload.leaders, t("planBoard.leader"))}
          {select("locationId", payload.locations, t("planBoard.location"))}
        </div>
        <div className={labelClass}>
          {t("planBoard.groups")}
          {payload.groups.length === 0 ? (
            <span className="text-[12px]">{t("planBoard.groupsNone")}</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {payload.groups.map((g) => {
                const on = fields.groupNames.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ groupNames: on ? fields.groupNames.filter((x) => x !== g) : [...fields.groupNames, g] })}
                    className={
                      "rounded-full border px-2.5 py-1 text-[12.5px] " +
                      (on ? "border-ember bg-ember text-white" : "border-mist bg-paper-2 text-ink hover:bg-mist")
                    }
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          )}
          <span className="text-[11.5px]">{t("planBoard.groupsHint")}</span>
        </div>
        <label className={labelClass}>
          {t("planLists.description")}
          <textarea value={fields.description ?? ""} onChange={(e) => set({ description: e.target.value || null })} className={inputClass} rows={3} />
        </label>
        <label className={labelClass}>
          {t("planLists.notes")}
          <textarea value={fields.notes ?? ""} onChange={(e) => set({ notes: e.target.value || null })} className={inputClass} rows={2} />
        </label>

        <fieldset className="flex flex-col gap-2 rounded-lg border border-mist p-3">
          <legend className="px-1 text-[12px] text-ink-secondary">{t("planBoard.moveTitle")}</legend>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <select
              value={moveDayId}
              onChange={(e) => {
                setMoveDayId(e.target.value);
                setMoveTarget("");
              }}
              className={inputClass + " w-auto"}
              aria-label={t("planBoard.date")}
            >
              {[...payload.days]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
            </select>
            <select value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)} className={inputClass} aria-label={t("planBoard.moveTitle")}>
              <option value="">{t("planBoard.movePick")}</option>
              {moveOptions.map(({ window: w, options }) => (
                <optgroup key={w.id} label={w.name}>
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => move(false)} disabled={busy || !moveTarget} className="rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink hover:bg-mist disabled:opacity-50">
              {t("planBoard.moveAction")}
            </button>
            <button onClick={() => move(true)} disabled={busy || !moveTarget} className="rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink hover:bg-mist disabled:opacity-50">
              {t("planBoard.copyAction")}
            </button>
          </div>
        </fieldset>

        {error && <p className="text-[13px] text-red-600">{error}</p>}

        <div className="mt-auto flex items-center justify-end gap-2 border-t border-mist pt-3">
          <button
            onClick={() => {
              onDelete(blockId);
              onClose();
            }}
            className="mr-auto text-[13px] text-red-600 hover:underline"
          >
            {t("planBoard.deleteBlock")}
          </button>
          <button onClick={onClose} className="text-[13px] text-ink-secondary hover:underline">
            {t("common.cancel")}
          </button>
          <button onClick={() => save()} disabled={busy} className={btnPrimary}>
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
