"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n";
import BodyMapPicker from "./BodyMapPicker";
import IncidentFormModal, { type IncidentClientData } from "./IncidentFormModal";

const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

function photoUrl(eventId: string, photoGcsPath: string | null): string | null {
  if (!photoGcsPath) return null;
  const filename = photoGcsPath.split("/").pop();
  return `/api/events/${eventId}/incident-photos/${filename}`;
}

interface IncidentDetailModalProps {
  eventId: string;
  participantId: string;
  incident: IncidentClientData;
  onClose: () => void;
  onChanged: () => void;
}

export default function IncidentDetailModal({
  eventId,
  participantId,
  incident,
  onClose,
  onChanged,
}: IncidentDetailModalProps) {
  const { t } = useTranslations();
  const [editing, setEditing] = useState(false);
  const [followingUp, setFollowingUp] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(t("incidentDetail.confirmDelete"))) return;
    setDeleting(true);
    await fetch(`/api/incidents/${incident.id}/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updateType: "void",
        actionSummary: incident.actionSummary,
        details: incident.details,
      }),
    });
    setDeleting(false);
    onChanged();
    onClose();
  }

  if (editing) {
    return (
      <IncidentFormModal
        eventId={eventId}
        participantId={participantId}
        mode="edit"
        incident={incident}
        onClose={() => setEditing(false)}
        onSaved={onChanged}
      />
    );
  }

  if (followingUp) {
    return (
      <IncidentFormModal
        eventId={eventId}
        participantId={participantId}
        mode="follow-up"
        incident={incident}
        onClose={() => setFollowingUp(false)}
        onSaved={onChanged}
      />
    );
  }

  const previewUrl = photoUrl(eventId, incident.photoGcsPath);
  const bodyMapValue =
    incident.bodyView && incident.bodyXPct !== null && incident.bodyYPct !== null
      ? { bodyView: incident.bodyView, bodyXPct: Number(incident.bodyXPct), bodyYPct: Number(incident.bodyYPct) }
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-paper p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <span className="rounded-full bg-paper-2 px-2.5 py-0.5 text-[12px] text-ink-secondary">
              {t(`incidentForm.category.${incident.category}`)}
            </span>
            <h2 className="mt-1 text-[16px] font-semibold text-ink">{incident.actionSummary}</h2>
          </div>
          <button onClick={onClose} className="text-[13px] text-ink-secondary hover:text-ink">
            ×
          </button>
        </div>

        {incident.tempC && (
          <p className="mb-2 text-[14px] text-ink">
            {t("incidentForm.tempLabel")}: {incident.tempC} °C
          </p>
        )}
        {incident.pillName && (
          <p className="mb-2 text-[14px] text-ink">
            {t("incidentForm.medLabel")}: {incident.pillName}
          </p>
        )}
        <p className="mb-3 whitespace-pre-line text-[14px] text-ink">{incident.details}</p>

        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="mb-3 max-h-64 rounded-lg object-contain" />
        )}

        {bodyMapValue && (
          <div className="mb-3">
            <BodyMapPicker value={bodyMapValue} onChange={() => {}} locked frontLabel={t("bodyMap.front")} backLabel={t("bodyMap.back")} />
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => setEditing(true)} className={btnPrimary}>
            {t("incidentDetail.editButton")}
          </button>
          <button
            onClick={() => setFollowingUp(true)}
            className="rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2"
          >
            {t("incidentDetail.followUpButton")}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg border border-red-300 bg-paper px-4 py-2 text-[14px] text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {t("incidentDetail.deleteButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
