"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";

type EventBasic = { id: string; name: string; startDate: string; endDate: string };
type Slot = { id: string; name: string };

type ChecklistRow = {
  participantId: string;
  participantName: string;
  participantGroup: string | null;
  eventMedId: string;
  medName: string;
  dose: string | null;
  notes: string | null;
  given: boolean;
  givenAt: string | null;
};

type ParticipantNotes = {
  allergies: string | null;
  medsNotes: string | null;
  chronicIssues: string | null;
  otherNotes: string | null;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function MedChecklistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = use(params);
  const { t } = useTranslations();

  const [event, setEvent] = useState<EventBasic | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [date, setDate] = useState(todayIso());
  const [slotId, setSlotId] = useState("");
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedParticipantId, setExpandedParticipantId] = useState<string | null>(null);
  const [notesCache, setNotesCache] = useState<Record<string, ParticipantNotes>>({});

  useEffect(() => {
    Promise.all([
      fetch(`/api/events/${eventId}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/events/${eventId}/list-items?kind=slot`).then((r) => (r.ok ? r.json() : [])),
    ]).then(([ev, slotList]) => {
      setEvent(ev);
      setSlots(slotList);
      if (slotList.length > 0) setSlotId((prev) => prev || slotList[0].id);
    });
  }, [eventId]);

  async function loadChecklist() {
    if (!slotId) return;
    setLoading(true);
    const res = await fetch(`/api/events/${eventId}/med-checklist?date=${date}&slotId=${slotId}`);
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    loadChecklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, slotId]);

  async function toggleGiven(row: ChecklistRow) {
    const nextGiven = !row.given;
    setRows((prev) =>
      prev.map((r) =>
        r.participantId === row.participantId && r.eventMedId === row.eventMedId
          ? { ...r, given: nextGiven }
          : r
      )
    );
    const res = await fetch(`/api/events/${eventId}/med-checklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participantId: row.participantId,
        eventMedId: row.eventMedId,
        eventSlotId: slotId,
        date,
        given: nextGiven,
      }),
    });
    if (!res.ok) {
      // revert on failure
      setRows((prev) =>
        prev.map((r) =>
          r.participantId === row.participantId && r.eventMedId === row.eventMedId
            ? { ...r, given: row.given }
            : r
        )
      );
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
        const data = await res.json();
        setNotesCache((prev) => ({ ...prev, [participantId]: data }));
      }
    }
  }

  const grouped = useMemo(() => {
    const byParticipant = new Map<string, { name: string; group: string | null; meds: ChecklistRow[] }>();
    for (const row of rows) {
      const entry = byParticipant.get(row.participantId) ?? {
        name: row.participantName,
        group: row.participantGroup,
        meds: [],
      };
      entry.meds.push(row);
      byParticipant.set(row.participantId, entry);
    }
    const list = Array.from(byParticipant.entries()).map(([participantId, v]) => ({
      participantId,
      ...v,
      allGiven: v.meds.every((m) => m.given),
    }));
    list.sort((a, b) => {
      if (a.allGiven !== b.allGiven) return a.allGiven ? 1 : -1;
      return a.name.localeCompare(b.name, "cs");
    });
    return list;
  }, [rows]);

  const givenCount = rows.filter((r) => r.given).length;

  if (!event) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <a href={`/events/${eventId}/health`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("participantsPage.title")}
      </a>

      <div className="mb-4 mt-2 flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold text-ink">
          {event.name} — {t("medChecklistPage.title")}
        </h1>
        <a href={`/events/${eventId}/health/meds/grid`} className="text-[13px] text-ember hover:underline">
          {t("medGridPage.title")}
        </a>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          min={event.startDate.slice(0, 10)}
          max={event.endDate.slice(0, 10)}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink"
        />
        <select
          value={slotId}
          onChange={(e) => setSlotId(e.target.value)}
          className="rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink"
        >
          {slots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {rows.length > 0 && (
        <p className="mb-3 text-[13px] text-ink-secondary">
          {t("medChecklistPage.progress", { given: String(givenCount), total: String(rows.length) })}
        </p>
      )}

      {loading ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : grouped.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("medChecklistPage.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {grouped.map((p) => {
            const notes = notesCache[p.participantId];
            const hasNotes = notes && (notes.allergies || notes.medsNotes || notes.chronicIssues || notes.otherNotes);
            return (
              <div key={p.participantId} className="rounded-lg border border-mist/60 p-2">
                <button
                  onClick={() => toggleNotes(p.participantId)}
                  className="text-[14px] font-medium text-ink hover:underline"
                >
                  {p.name}
                  {p.group && <span className="ml-1 text-[12px] font-normal text-ink-secondary">({p.group})</span>}
                </button>

                {expandedParticipantId === p.participantId && (
                  <div className="mt-1 rounded-lg bg-paper-2 p-2 text-[13px] text-ink">
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
                )}

                <div className="mt-2 flex flex-col gap-1">
                  {p.meds.map((m) => (
                    <label
                      key={m.eventMedId}
                      className="flex items-center gap-2 text-[14px] text-ink"
                    >
                      <input type="checkbox" checked={m.given} onChange={() => toggleGiven(m)} />
                      {m.medName}
                      {m.dose && <span className="text-ink-secondary">· {m.dose}</span>}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
