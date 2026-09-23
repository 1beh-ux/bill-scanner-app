"use client";

import { useEffect, useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useTranslations } from "@/lib/i18n";
import type { DragData, PlanPayload } from "./types";

const REMAINING_KEY = "planning.libraryRemainingOnly";

export default function LibraryPanel({ payload, eventId }: { payload: PlanPayload; eventId: string }) {
  const { t } = useTranslations();
  const [query, setQuery] = useState("");
  const [remainingOnly, setRemainingOnly] = useState(false);

  // Per-viewer convenience -- restored after mount so SSR and client agree.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemainingOnly(localStorage.getItem(REMAINING_KEY) === "1");
    } catch {}
  }, []);
  function toggleRemaining(value: boolean) {
    setRemainingOnly(value);
    try {
      localStorage.setItem(REMAINING_KEY, value ? "1" : "0");
    } catch {}
  }

  const q = query.trim().toLowerCase();
  const scheduled = useMemo(() => new Set(payload.blocks.map((b) => b.activityId)), [payload.blocks]);
  const activities = payload.activities.filter(
    (a) => a.name.toLowerCase().includes(q) && (!remainingOnly || a.repeatable || !scheduled.has(a.id))
  );
  // Base-library items not yet in this event's library (same rule as the import).
  const imported = new Set(payload.activities.flatMap((a) => [a.sourceTemplateId, a.name.trim().toLowerCase()]));
  const base = payload.baseActivities.filter(
    (b) => !imported.has(b.id) && !imported.has(b.name.trim().toLowerCase()) && b.name.toLowerCase().includes(q)
  );
  const colorOf = (id: string | null) => payload.categories.find((c) => c.id === id)?.data?.color;

  return (
    <aside className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-ink">{t("planActivities.title")}</h2>
        <a href={`/events/${eventId}/planning/activities`} className="text-[12px] text-ember hover:underline">
          {t("common.edit")}
        </a>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("planBoard.searchPlaceholder")}
        className="w-full rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember"
      />
      <label className="flex items-center gap-2 text-[12px] text-ink-secondary">
        <input type="checkbox" checked={remainingOnly} onChange={(e) => toggleRemaining(e.target.checked)} />
        {t("planBoard.remainingOnly")}
      </label>
      <p className="text-[11.5px] text-ink-secondary">{t("planBoard.libraryHint")}</p>

      <div className="flex flex-col gap-1.5">
        {activities.map((a) => (
          <LibraryCard
            key={a.id}
            data={{ type: "activity", activityId: a.id, label: a.name }}
            name={a.name}
            durationMin={a.defaultDurationMin}
            color={colorOf(a.primaryCategoryId)}
            repeatable={a.repeatable}
          />
        ))}
        {activities.length === 0 && base.length === 0 && (
          <p className="text-[12px] text-ink-secondary">{t("planBoard.libraryEmpty")}</p>
        )}
      </div>

      {base.length > 0 && (
        <>
          <h3 className="mt-2 text-[12px] font-medium uppercase tracking-wide text-ink-secondary">{t("planBoard.baseSection")}</h3>
          <div className="flex flex-col gap-1.5">
            {base.map((b) => (
              <LibraryCard
                key={b.id}
                data={{ type: "base", templateId: b.id, label: b.name }}
                name={b.name}
                durationMin={b.data?.defaultDurationMin ?? 30}
                repeatable={Boolean(b.data?.repeatable)}
                muted
              />
            ))}
          </div>
        </>
      )}
    </aside>
  );
}

function LibraryCard({
  data,
  name,
  durationMin,
  color,
  repeatable,
  muted,
}: {
  data: DragData;
  name: string;
  durationMin: number;
  color?: string;
  repeatable: boolean;
  muted?: boolean;
}) {
  const id = data.type === "activity" ? `drag-act:${data.activityId}` : data.type === "base" ? `drag-base:${data.templateId}` : "";
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id, data });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ borderLeftColor: color ?? "#9ca3af" }}
      className={
        "flex cursor-grab touch-manipulation items-center justify-between gap-2 rounded border border-l-4 px-2 py-1.5 text-[13px] active:cursor-grabbing " +
        (muted ? "border-dashed border-mist bg-paper text-ink-secondary " : "border-mist bg-paper-2 text-ink ") +
        (isDragging ? "opacity-40" : "")
      }
    >
      <span className="truncate">{name}</span>
      <span className="shrink-0 text-[11px] text-ink-secondary">
        {durationMin} min{repeatable ? " ↻" : ""}
      </span>
    </div>
  );
}
