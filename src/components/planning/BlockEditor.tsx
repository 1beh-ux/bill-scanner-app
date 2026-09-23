"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { MIN_SLOT_MINUTES, minutesToHhmm, type PlanBlockRow, type PlanPayload } from "@/lib/planning";
import type { ComputedSlot } from "@/lib/planning-engine";

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const labelClass = "flex flex-col gap-1 text-[12px] text-ink-secondary";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

type Fields = Pick<
  PlanBlockRow,
  "activityId" | "customName" | "description" | "primaryCategoryId" | "secondaryCategoryId" | "leaderId" | "locationId" | "notes"
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
}: {
  eventId: string;
  payload: PlanPayload;
  blockId: string;
  time: ComputedSlot | undefined;
  onClose: () => void;
  onSaved: (next: PlanPayload) => void;
  onResize: (slotId: string, durationMin: number) => void;
  onDelete: (blockId: string) => void;
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
        }
      : null
  );
  const [duration, setDuration] = useState(slot?.durationMin ?? 30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!block || !slot || !fields) return null;
  const activity = payload.activities.find((a) => a.id === fields.activityId);
  const set = (patch: Partial<Fields>) => setFields({ ...fields, ...patch });

  function pickActivity(activityId: string) {
    const a = payload.activities.find((x) => x.id === activityId);
    if (!a) return set({ activityId: null });
    set({
      activityId: a.id,
      customName: null,
      description: a.description,
      primaryCategoryId: a.primaryCategoryId,
      secondaryCategoryId: a.secondaryCategoryId,
      leaderId: a.defaultLeaderId,
      locationId: a.defaultLocationId,
    });
    setDuration(a.defaultDurationMin);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/events/${eventId}/planning/blocks/${blockId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    setBusy(false);
    if (!res.ok) {
      setError(t("planBoard.errorSaveFailed"));
      return;
    }
    onSaved(await res.json());
    if (duration !== slot!.durationMin && duration >= MIN_SLOT_MINUTES) onResize(slot!.id, duration);
    onClose();
  }

  const select = (key: keyof Fields, items: { id: string; name: string }[], label: string) => (
    <label className={labelClass}>
      {label}
      <select value={fields[key] ?? ""} onChange={(e) => set({ [key]: e.target.value || null })} className={inputClass}>
        <option value="">—</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
    </label>
  );
  const categories = (group: "primary" | "secondary") => payload.categories.filter((c) => (c.data?.group ?? "primary") === group);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col gap-3 overflow-y-auto bg-paper p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[17px] font-semibold text-ink">{fields.customName || activity?.name || "—"}</h2>
          {time && (
            <span className="text-[13px] text-ink-secondary">
              {minutesToHhmm(time.startMin)}–{minutesToHhmm(time.endMin)}
            </span>
          )}
        </div>

        <label className={labelClass}>
          {t("planBoard.activity")}
          <select value={fields.activityId ?? ""} onChange={(e) => pickActivity(e.target.value)} className={inputClass}>
            <option value="">—</option>
            {payload.activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          {t("planBoard.titleOverride")}
          <input
            type="text"
            value={fields.customName ?? ""}
            placeholder={activity?.name}
            onChange={(e) => set({ customName: e.target.value || null })}
            className={inputClass}
          />
        </label>
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
        <label className={labelClass}>
          {t("planLists.description")}
          <textarea value={fields.description ?? ""} onChange={(e) => set({ description: e.target.value || null })} className={inputClass} rows={3} />
        </label>
        <label className={labelClass}>
          {t("planLists.notes")}
          <textarea value={fields.notes ?? ""} onChange={(e) => set({ notes: e.target.value || null })} className={inputClass} rows={2} />
        </label>

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
          <button onClick={save} disabled={busy} className={btnPrimary}>
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
