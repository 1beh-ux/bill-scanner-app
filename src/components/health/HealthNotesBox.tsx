"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import type { HealthNote, HealthNotePlace } from "@/lib/health-notes";

/** Loads one participant's health notes for a place (Nastavení akce -> Zdraví decides which). */
export function useHealthNotes(eventId: string, participantId: string | null, place: HealthNotePlace): HealthNote[] | null {
  const [notes, setNotes] = useState<HealthNote[] | null>(null);
  useEffect(() => {
    if (!participantId) return;
    fetch(`/api/events/${eventId}/health-notes/values?place=${place}&participantId=${participantId}`)
      .then((r) => (r.ok ? r.json() : { notes: {} }))
      .then((d: { notes: Record<string, HealthNote[]> }) => setNotes(d.notes[participantId] ?? []))
      .catch(() => setNotes([]));
  }, [eventId, participantId, place]);
  return notes;
}

/** The notes, highlighted ones as warnings first-class (red). */
export default function HealthNotesBox({ notes, className = "" }: { notes: HealthNote[] | null; className?: string }) {
  const { t } = useTranslations();
  if (notes === null) return <p className={"text-ink-secondary " + className}>{t("common.loading")}</p>;
  if (notes.length === 0) return <p className={"text-ink-secondary " + className}>{t("participantDetail.notesEmpty")}</p>;
  return (
    <div className={"flex flex-col gap-1 " + className}>
      {notes.map((n) => (
        <p key={n.key} className={n.highlight ? "rounded bg-red-50 px-1.5 py-0.5 text-red-800" : ""}>
          {n.highlight && "⚠ "}
          <strong>{n.label}:</strong> <span className="whitespace-pre-wrap">{n.value}</span>
        </p>
      ))}
    </div>
  );
}
