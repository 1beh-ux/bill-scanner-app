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

type ParticipantNotes = {
  allergies: string | null;
  medsNotes: string | null;
  chronicIssues: string | null;
  otherNotes: string | null;
};

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
function formatDayShort(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
}

/** Row index -> group metadata, assuming rows are already grouped/sorted by participant (server-side orderBy). */
function computeGroupMeta(rows: GridRow[]) {
  const meta: { isFirst: boolean; isLast: boolean; shadeB: boolean; hasMultiple: boolean }[] = [];
  let shade = false;
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j < rows.length && rows[j].participantId === rows[i].participantId) j += 1;
    const size = j - i;
    for (let k = i; k < j; k++) meta.push({ isFirst: k === i, isLast: k === j - 1, shadeB: shade, hasMultiple: size > 1 });
    shade = !shade;
    i = j;
  }
  return meta;
}

export default function MedChecklistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = use(params);
  const { t } = useTranslations();

  const [event, setEvent] = useState<EventBasic | null>(null);
  const [preset, setPreset] = useState<Preset>("today");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [data, setData] = useState<GridResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleSlotIds, setVisibleSlotIds] = useState<Set<string> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedParticipantId, setExpandedParticipantId] = useState<string | null>(null);
  const [notesCache, setNotesCache] = useState<Record<string, ParticipantNotes>>({});

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
    if (event) applyPreset("today", event);
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

  // Periods that actually have a scheduled med somewhere in this range --
  // everything else stays hidden from the table entirely, and the period
  // filter only ever offers to narrow further from this set.
  const usedSlots = useMemo(() => {
    if (!data) return [];
    const used = new Set(data.rows.flatMap((r) => r.slotIds));
    return data.slots.filter((s) => used.has(s.id));
  }, [data]);

  useEffect(() => {
    setVisibleSlotIds(new Set(usedSlots.map((s) => s.id)));
  }, [usedSlots]);

  const visibleSlots = useMemo(
    () => usedSlots.filter((s) => visibleSlotIds?.has(s.id)),
    [usedSlots, visibleSlotIds]
  );

  function toggleSlotVisible(slotId: string) {
    setVisibleSlotIds((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
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
            ? { ...r, days: { ...r.days, [day]: { ...r.days[day], [slotId]: { given: nextGiven, givenAt: nextGiven ? new Date().toISOString() : null } } } }
            : r
        ),
      };
    });

    const res = await fetch(`/api/events/${eventId}/med-checklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: row.participantId, eventMedId: row.eventMedId, eventSlotId: slotId, date: day, given: nextGiven }),
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

  async function toggleNotes(participantId: string) {
    if (expandedParticipantId === participantId) {
      setExpandedParticipantId(null);
      return;
    }
    setExpandedParticipantId(participantId);
    if (!notesCache[participantId]) {
      const res = await fetch(`/api/participants/${participantId}`);
      if (res.ok) {
        const notes = await res.json();
        setNotesCache((prev) => ({ ...prev, [participantId]: notes }));
      }
    }
  }

  // A row whose med has nothing in any currently-visible period would just
  // be an empty stripe -- drop it. Search narrows by participant name.
  const visibleRows = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    return data.rows.filter(
      (r) =>
        r.slotIds.some((id) => visibleSlotIds?.has(id)) &&
        (!q || r.participantName.toLowerCase().includes(q))
    );
  }, [data, visibleSlotIds, searchQuery]);

  const groupMeta = useMemo(() => computeGroupMeta(visibleRows), [visibleRows]);

  /**
   * Border/shade classes applied directly to every <td> in a row (not the
   * <tr>) -- <tr>-level borders render unreliably in collapsed tables
   * across browsers. "start" = the sticky name cell, "end" = the last
   * visible data cell, "middle" = every other data cell.
   */
  function cellClasses(i: number, position: "start" | "middle" | "end"): string {
    const m = groupMeta[i];
    const classes = [m?.shadeB ? "bg-paper-2" : "bg-paper"];
    if (m?.isFirst) classes.push("border-t-2 border-t-ink");
    if (m?.isLast) classes.push("border-b-2 border-b-ink");
    if (position !== "start") classes.push("border-l border-mist"); // normal grid separator from the previous column
    if (position === "start") classes.push(m?.hasMultiple ? "border-r-2 border-r-ink" : "border-r border-mist");
    if (position === "end" && m?.hasMultiple) classes.push("border-r-2 border-r-ink");
    return classes.join(" ");
  }

  function NotesPanel({ participantId }: { participantId: string }) {
    const notes = notesCache[participantId];
    const hasNotes = notes && (notes.allergies || notes.medsNotes || notes.chronicIssues || notes.otherNotes);
    return (
      <div className="rounded-lg bg-paper-2 p-2 text-[12px] text-ink">
        {hasNotes ? (
          <>
            {notes?.allergies && <p><strong>{t("participantDetail.allergiesLabel")}:</strong> {notes.allergies}</p>}
            {notes?.medsNotes && <p><strong>{t("participantDetail.medsNotesLabel")}:</strong> {notes.medsNotes}</p>}
            {notes?.chronicIssues && <p><strong>{t("participantDetail.chronicIssuesLabel")}:</strong> {notes.chronicIssues}</p>}
            {notes?.otherNotes && <p><strong>{t("participantDetail.otherNotesLabel")}:</strong> {notes.otherNotes}</p>}
          </>
        ) : (
          <p className="text-ink-secondary">{t("participantDetail.notesEmpty")}</p>
        )}
      </div>
    );
  }

  if (!event) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <a href={`/events/${eventId}/health`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("participantsPage.title")}
      </a>

      <h1 className="mb-4 mt-2 text-[22px] font-semibold text-ink">
        {event.name} — {t("medChecklistPage.title")}
      </h1>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["today", "week", "event", "custom"] as Preset[]).map((p) => (
          <button
            key={p}
            onClick={() => (p === "custom" ? setPreset("custom") : applyPreset(p, event))}
            className={"rounded-lg px-3 py-1.5 text-[13px] " + (preset === p ? "bg-ember text-white" : "border border-mist bg-paper-2 text-ink")}
          >
            {t(`medGridPage.preset.${p}`)}
          </button>
        ))}
        {preset === "custom" && (
          <>
            <input type="date" value={startDate} min={event.startDate.slice(0, 10)} max={event.endDate.slice(0, 10)} onChange={(e) => setStartDate(e.target.value)} className="rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-[13px] text-ink" />
            <span className="text-ink-secondary">–</span>
            <input type="date" value={endDate} min={event.startDate.slice(0, 10)} max={event.endDate.slice(0, 10)} onChange={(e) => setEndDate(e.target.value)} className="rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-[13px] text-ink" />
          </>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("participantsPage.searchPlaceholder")}
            aria-label={t("participantsPage.searchPlaceholder")}
            className="w-full rounded-lg border border-mist bg-paper-2 px-3 py-1.5 pr-8 text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none focus:ring-1 focus:ring-ember"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              aria-label={t("common.cancel")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink"
            >
              ×
            </button>
          )}
        </div>

        {usedSlots.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-ink-secondary">{t("medGridPage.periodFilterLabel")}:</span>
            {usedSlots.map((s) => (
              <label key={s.id} className="flex items-center gap-1 rounded-full border border-mist bg-paper-2 px-2 py-1 text-[12px] text-ink">
                <input type="checkbox" checked={visibleSlotIds?.has(s.id) ?? true} onChange={() => toggleSlotVisible(s.id)} />
                {s.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="mb-4">
        <PdfExportControls
          buildHref={(mode, format) =>
            `/api/events/${eventId}/med-checklist/export?startDate=${startDate}&endDate=${endDate}&mode=${mode}&format=${format}&slotIds=${visibleSlots.map((s) => s.id).join(",")}`
          }
        />
      </div>

      {loading ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : !data || visibleRows.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("medChecklistPage.empty")}</p>
      ) : (
        <>
          {/* Desktop / wide: full day×period grid */}
          <div className="hidden overflow-x-auto rounded-lg border border-mist md:block">
            <table className="border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-mist">
                  <th rowSpan={2} className="sticky left-0 z-10 whitespace-nowrap border-r border-mist bg-paper-2 p-1.5 text-left align-bottom font-medium text-ink-secondary">
                    {t("medGridPage.colParticipant")}
                  </th>
                  {data.days.map((day) => (
                    <th key={day} colSpan={visibleSlots.length} className="border-l border-mist p-1 text-center font-medium text-ink-secondary">
                      {formatDayShort(day)}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-mist">
                  {data.days.flatMap((day) =>
                    visibleSlots.map((slot) => (
                      <th key={`${day}:${slot.id}`} className="h-20 w-6 border-l border-mist p-0.5 align-bottom">
                        <span
                          style={{ writingMode: "vertical-rl", textOrientation: "sideways", transform: "rotate(180deg)" }}
                          className="whitespace-nowrap text-[10px] text-ink-secondary"
                        >
                          {slot.name}
                        </span>
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, i) => (
                  <tr key={`${row.participantId}:${row.eventMedId}`}>
                    <td className={`sticky left-0 z-10 whitespace-nowrap p-1.5 text-ink ${cellClasses(i, "start")}`}>
                      <button onClick={() => toggleNotes(row.participantId)} className="text-left hover:underline">
                        {row.participantName}
                      </button>
                      <span className="ml-1 text-[10px] text-ink-secondary">{row.medName}</span>
                    </td>
                    {data.days.flatMap((day) =>
                      visibleSlots.map((slot, si) => {
                        const position = si === visibleSlots.length - 1 ? "end" : "middle";
                        if (!row.slotIds.includes(slot.id)) {
                          return <td key={`${day}:${slot.id}`} className={cellClasses(i, position)} />;
                        }
                        const status = row.days[day]?.[slot.id];
                        return (
                          <td key={`${day}:${slot.id}`} className={`p-0.5 text-center ${cellClasses(i, position)}`}>
                            <input type="checkbox" checked={!!status?.given} onChange={() => toggleCell(row, day, slot.id)} />
                          </td>
                        );
                      })
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {expandedParticipantId && visibleRows.some((r) => r.participantId === expandedParticipantId) && (
            <div className="mt-2 hidden md:block">
              <NotesPanel participantId={expandedParticipantId} />
            </div>
          )}

          {/* Mobile: per-participant cards, days/periods listed vertically instead of as columns */}
          <div className="flex flex-col gap-2 md:hidden">
            {(() => {
              const byParticipant = new Map<string, { name: string; meds: GridRow[] }>();
              for (const row of visibleRows) {
                const entry = byParticipant.get(row.participantId) ?? { name: row.participantName, meds: [] };
                entry.meds.push(row);
                byParticipant.set(row.participantId, entry);
              }
              return Array.from(byParticipant.entries()).map(([participantId, p]) => (
                <div key={participantId} className="rounded-lg border border-mist/60 p-2">
                  <button onClick={() => toggleNotes(participantId)} className="text-[14px] font-medium text-ink hover:underline">
                    {p.name}
                  </button>
                  {expandedParticipantId === participantId && (
                    <div className="mt-1">
                      <NotesPanel participantId={participantId} />
                    </div>
                  )}
                  <div className="mt-2 flex flex-col gap-2">
                    {p.meds.map((row) => (
                      <div key={row.eventMedId}>
                        <div className="text-[13px] font-medium text-ink">{row.medName}</div>
                        <div className="flex flex-col gap-1">
                          {data.days.map((day) => {
                            const slotsForRow = visibleSlots.filter((s) => row.slotIds.includes(s.id));
                            if (slotsForRow.length === 0) return null;
                            return (
                              <div key={day} className="flex flex-wrap items-center gap-3 text-[12px] text-ink">
                                <span className="w-12 text-ink-secondary">{formatDayShort(day)}</span>
                                {slotsForRow.map((slot) => {
                                  const status = row.days[day]?.[slot.id];
                                  return (
                                    <label key={slot.id} className="flex items-center gap-1">
                                      <input type="checkbox" checked={!!status?.given} onChange={() => toggleCell(row, day, slot.id)} />
                                      {slot.name}
                                    </label>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        </>
      )}
    </div>
  );
}
