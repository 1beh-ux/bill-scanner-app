"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";
import PdfExportControls from "@/components/health/PdfExportControls";

type EventBasic = { id: string; name: string; startDate: string; endDate: string };
type Slot = { id: string; name: string };
type CellStatus = { given: boolean; givenAt: string | null };
type GridRow = {
  participantId: string;
  participantName: string;
  participantGroup: string | null;
  eventMedId: string;
  medName: string;
  slotIds: string[];
  days: Record<string, Record<string, CellStatus>>;
};
type GridResponse = { slots: Slot[]; days: string[]; rows: GridRow[] };

type Preset = "today" | "week" | "event" | "custom";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function startOfWeek(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
function clamp(iso: string, min: string, max: string): string {
  if (iso < min) return min;
  if (iso > max) return max;
  return iso;
}

export default function MedChecklistGridPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = use(params);
  const { t } = useTranslations();

  const [event, setEvent] = useState<EventBasic | null>(null);
  const [preset, setPreset] = useState<Preset>("week");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [data, setData] = useState<GridResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/events/${eventId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setEvent);
  }, [eventId]);

  function applyPreset(p: Preset, ev: EventBasic) {
    const min = ev.startDate.slice(0, 10);
    const max = ev.endDate.slice(0, 10);
    setPreset(p);
    if (p === "today") {
      const d = clamp(todayIso(), min, max);
      setStartDate(d);
      setEndDate(d);
    } else if (p === "week") {
      const wkStart = clamp(startOfWeek(todayIso()), min, max);
      const wkEnd = clamp(addDays(wkStart, 6), min, max);
      setStartDate(wkStart);
      setEndDate(wkEnd);
    } else if (p === "event") {
      setStartDate(min);
      setEndDate(max);
    }
  }

  useEffect(() => {
    if (event) applyPreset("week", event);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  async function loadGrid(s: string, e: string) {
    setLoading(true);
    const res = await fetch(`/api/events/${eventId}/med-checklist/grid?startDate=${s}&endDate=${e}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    if (startDate && endDate && startDate <= endDate) loadGrid(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, startDate, endDate]);

  function toggleDayExpanded(day: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  async function toggleCell(row: GridRow, day: string, slotId: string) {
    const current = row.days[day]?.[slotId];
    const nextGiven = !current?.given;

    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((r) =>
          r.participantId === row.participantId && r.eventMedId === row.eventMedId
            ? {
                ...r,
                days: {
                  ...r.days,
                  [day]: {
                    ...r.days[day],
                    [slotId]: { given: nextGiven, givenAt: nextGiven ? new Date().toISOString() : null },
                  },
                },
              }
            : r
        ),
      };
    });

    const res = await fetch(`/api/events/${eventId}/med-checklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participantId: row.participantId,
        eventMedId: row.eventMedId,
        eventSlotId: slotId,
        date: day,
        given: nextGiven,
      }),
    });
    if (!res.ok) {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((r) =>
            r.participantId === row.participantId && r.eventMedId === row.eventMedId
              ? { ...r, days: { ...r.days, [day]: { ...r.days[day], [slotId]: current ?? { given: false, givenAt: null } } } }
              : r
          ),
        };
      });
    }
  }

  function daySummary(row: GridRow, day: string): { given: number; total: number } {
    const slotMap = row.days[day] || {};
    const relevant = row.slotIds.map((id) => slotMap[id]);
    return { given: relevant.filter((v) => v?.given).length, total: relevant.length };
  }

  const slotNameById = useMemo(() => {
    const m = new Map<string, string>();
    (data?.slots ?? []).forEach((s) => m.set(s.id, s.name));
    return m;
  }, [data]);

  if (!event) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <a href={`/events/${eventId}/health/meds`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("medChecklistPage.title")}
      </a>

      <h1 className="mb-4 mt-2 text-[22px] font-semibold text-ink">
        {event.name} — {t("medGridPage.title")}
      </h1>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["today", "week", "event", "custom"] as Preset[]).map((p) => (
          <button
            key={p}
            onClick={() => (p === "custom" ? setPreset("custom") : applyPreset(p, event))}
            className={
              "rounded-lg px-3 py-1.5 text-[13px] " +
              (preset === p ? "bg-ember text-white" : "border border-mist bg-paper-2 text-ink")
            }
          >
            {t(`medGridPage.preset.${p}`)}
          </button>
        ))}
        {preset === "custom" && (
          <>
            <input
              type="date"
              value={startDate}
              min={event.startDate.slice(0, 10)}
              max={event.endDate.slice(0, 10)}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-[13px] text-ink"
            />
            <span className="text-ink-secondary">–</span>
            <input
              type="date"
              value={endDate}
              min={event.startDate.slice(0, 10)}
              max={event.endDate.slice(0, 10)}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-[13px] text-ink"
            />
          </>
        )}
      </div>

      <p className="mb-3 text-[12px] text-ink-secondary">{t("medGridPage.expandHint")}</p>

      <div className="mb-4">
        <PdfExportControls
          buildHref={(mode, format) =>
            `/api/events/${eventId}/med-checklist/export?type=grid&startDate=${startDate}&endDate=${endDate}&mode=${mode}&format=${format}`
          }
        />
      </div>

      {loading ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : !data || data.rows.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("medChecklistPage.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-mist">
          <table className="w-full min-w-[700px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-mist text-left">
                <th className="sticky left-0 z-10 bg-paper-2 p-2 font-medium text-ink-secondary">{t("common.name")}</th>
                {data.days.map((day) => (
                  <th key={day} className="border-l border-mist p-2 text-center font-medium text-ink-secondary">
                    <button onClick={() => toggleDayExpanded(day)} className="hover:underline">
                      {new Date(day).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={`${row.participantId}:${row.eventMedId}`} className="border-b border-mist/60">
                  <td className="sticky left-0 z-10 bg-paper p-2 text-ink">
                    {row.participantName}
                    <div className="text-[12px] text-ink-secondary">{row.medName}</div>
                  </td>
                  {data.days.map((day) => {
                    const expanded = expandedDays.has(day);
                    if (!expanded) {
                      const { given, total } = daySummary(row, day);
                      return (
                        <td key={day} className="border-l border-mist p-2 text-center text-ink-secondary">
                          {total > 0 ? `${given}/${total}` : "—"}
                        </td>
                      );
                    }
                    return (
                      <td key={day} className="border-l border-mist p-2">
                        <div className="flex flex-col gap-1">
                          {row.slotIds.map((slotId) => {
                            const status = row.days[day]?.[slotId];
                            return (
                              <label key={slotId} className="flex items-center gap-1 whitespace-nowrap text-[12px] text-ink">
                                <input
                                  type="checkbox"
                                  checked={!!status?.given}
                                  onChange={() => toggleCell(row, day, slotId)}
                                />
                                {slotNameById.get(slotId) ?? ""}
                              </label>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
