"use client";

import { useEffect, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";

type Guardian = {
  id: string;
  name: string | null;
  email: string;
  relationship: string | null;
  receivesCommunications: boolean;
};

type ParticipantDetail = {
  id: string;
  eventId: string;
  name: string;
  groupName: string | null;
  allergies: string | null;
  medsNotes: string | null;
  chronicIssues: string | null;
  otherNotes: string | null;
  guardians: Guardian[];
};

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

export default function ParticipantDetailPage({
  params,
}: {
  params: Promise<{ id: string; participantId: string }>;
}) {
  const { id: eventId, participantId } = use(params);
  const { t } = useTranslations();

  const [participant, setParticipant] = useState<ParticipantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editGroup, setEditGroup] = useState("");
  const [editAllergies, setEditAllergies] = useState("");
  const [editMedsNotes, setEditMedsNotes] = useState("");
  const [editChronicIssues, setEditChronicIssues] = useState("");
  const [editOtherNotes, setEditOtherNotes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [addingGuardian, setAddingGuardian] = useState(false);
  const [gName, setGName] = useState("");
  const [gEmail, setGEmail] = useState("");
  const [gRelationship, setGRelationship] = useState("");
  const [savingGuardian, setSavingGuardian] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/participants/${participantId}`);
    if (res.ok) setParticipant(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [participantId]);

  function startEdit() {
    if (!participant) return;
    setError(null);
    setEditName(participant.name);
    setEditGroup(participant.groupName ?? "");
    setEditAllergies(participant.allergies ?? "");
    setEditMedsNotes(participant.medsNotes ?? "");
    setEditChronicIssues(participant.chronicIssues ?? "");
    setEditOtherNotes(participant.otherNotes ?? "");
    setEditing(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim()) return;
    setSavingEdit(true);
    setError(null);
    const res = await fetch(`/api/participants/${participantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName.trim(),
        groupName: editGroup.trim() || null,
        allergies: editAllergies.trim() || null,
        medsNotes: editMedsNotes.trim() || null,
        chronicIssues: editChronicIssues.trim() || null,
        otherNotes: editOtherNotes.trim() || null,
      }),
    });
    setSavingEdit(false);
    if (!res.ok) {
      setError(t("participantDetail.errorSaveFailed"));
      return;
    }
    setEditing(false);
    load();
  }

  async function addGuardian(e: React.FormEvent) {
    e.preventDefault();
    if (!gEmail.trim()) return;
    setSavingGuardian(true);
    setError(null);
    const res = await fetch(`/api/participants/${participantId}/guardians`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: gName.trim() || undefined,
        email: gEmail.trim(),
        relationship: gRelationship.trim() || undefined,
      }),
    });
    setSavingGuardian(false);
    if (!res.ok) {
      setError(t("participantDetail.errorSaveFailed"));
      return;
    }
    setGName("");
    setGEmail("");
    setGRelationship("");
    setAddingGuardian(false);
    load();
  }

  async function removeGuardian(guardianId: string) {
    if (!window.confirm(t("participantDetail.confirmRemoveGuardian"))) return;
    await fetch(`/api/participants/${participantId}/guardians/${guardianId}`, { method: "DELETE" });
    load();
  }

  async function toggleReceives(guardian: Guardian) {
    await fetch(`/api/participants/${participantId}/guardians/${guardian.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receivesCommunications: !guardian.receivesCommunications }),
    });
    load();
  }

  if (loading) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  if (!participant) return <div className="p-8 text-[14px] text-ink-secondary">{t("eventDetail.notFound")}</div>;

  const hasNotes =
    participant.allergies || participant.medsNotes || participant.chronicIssues || participant.otherNotes;

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <a href={`/events/${eventId}/health`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("participantsPage.title")}
      </a>

      <div className="mb-4 mt-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">{participant.name}</h1>
          {participant.groupName && <p className="text-[14px] text-ink-secondary">{participant.groupName}</p>}
        </div>
        <button onClick={startEdit} className="text-[13px] text-ember hover:underline">
          {t("common.edit")}
        </button>
      </div>

      {error && <p className="mb-4 text-[14px] text-red-600">{error}</p>}

      <h2 className="mb-2 text-[16px] font-semibold text-ink">{t("participantDetail.notesTitle")}</h2>
      {hasNotes ? (
        <div className="mb-6 flex flex-col gap-2 rounded-lg border border-mist bg-paper-2 p-3 text-[14px] text-ink">
          {participant.allergies && (
            <p><strong>{t("participantDetail.allergiesLabel")}:</strong> {participant.allergies}</p>
          )}
          {participant.medsNotes && (
            <p><strong>{t("participantDetail.medsNotesLabel")}:</strong> {participant.medsNotes}</p>
          )}
          {participant.chronicIssues && (
            <p><strong>{t("participantDetail.chronicIssuesLabel")}:</strong> {participant.chronicIssues}</p>
          )}
          {participant.otherNotes && (
            <p><strong>{t("participantDetail.otherNotesLabel")}:</strong> {participant.otherNotes}</p>
          )}
        </div>
      ) : (
        <p className="mb-6 text-[14px] text-ink-secondary">{t("participantDetail.notesEmpty")}</p>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-ink">{t("participantDetail.guardiansTitle")}</h2>
        <button onClick={() => setAddingGuardian((v) => !v)} className="text-[13px] text-ember hover:underline">
          {t("participantDetail.addGuardianButton")}
        </button>
      </div>

      {addingGuardian && (
        <form onSubmit={addGuardian} className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-mist p-2">
          <input
            type="text"
            placeholder={t("common.name")}
            value={gName}
            onChange={(e) => setGName(e.target.value)}
            className={inputClass + " flex-1"}
          />
          <input
            type="email"
            placeholder={t("participantDetail.guardianEmailLabel")}
            value={gEmail}
            onChange={(e) => setGEmail(e.target.value)}
            className={inputClass + " flex-1"}
          />
          <input
            type="text"
            placeholder={t("participantDetail.guardianRelationshipLabel")}
            value={gRelationship}
            onChange={(e) => setGRelationship(e.target.value)}
            className={inputClass + " flex-1"}
          />
          <button type="submit" disabled={savingGuardian} className={btnPrimary}>
            {t("common.save")}
          </button>
        </form>
      )}

      {participant.guardians.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("participantDetail.guardiansEmpty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {participant.guardians.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-mist/60 p-2">
              <div className="text-[14px] text-ink">
                {g.name || g.email}
                {g.name && <span className="text-ink-secondary"> · {g.email}</span>}
                {g.relationship && <span className="text-ink-secondary"> · {g.relationship}</span>}
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-[12px] text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={g.receivesCommunications}
                    onChange={() => toggleReceives(g)}
                  />
                  {t("participantDetail.receivesCommunicationsLabel")}
                </label>
                <button
                  onClick={() => removeGuardian(g.id)}
                  className="text-[13px] text-red-600 hover:underline"
                >
                  {t("common.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-paper p-5">
            <h2 className="mb-4 text-[16px] font-semibold text-ink">{t("common.edit")}</h2>
            <form onSubmit={saveEdit} className="flex flex-col gap-3">
              <input
                type="text"
                placeholder={t("common.name")}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={inputClass}
                autoFocus
              />
              <input
                type="text"
                placeholder={t("participantsPage.colGroup")}
                value={editGroup}
                onChange={(e) => setEditGroup(e.target.value)}
                className={inputClass}
              />
              <textarea
                placeholder={t("participantDetail.allergiesLabel")}
                value={editAllergies}
                onChange={(e) => setEditAllergies(e.target.value)}
                className={inputClass}
                rows={2}
              />
              <textarea
                placeholder={t("participantDetail.medsNotesLabel")}
                value={editMedsNotes}
                onChange={(e) => setEditMedsNotes(e.target.value)}
                className={inputClass}
                rows={2}
              />
              <textarea
                placeholder={t("participantDetail.chronicIssuesLabel")}
                value={editChronicIssues}
                onChange={(e) => setEditChronicIssues(e.target.value)}
                className={inputClass}
                rows={2}
              />
              <textarea
                placeholder={t("participantDetail.otherNotesLabel")}
                value={editOtherNotes}
                onChange={(e) => setEditOtherNotes(e.target.value)}
                className={inputClass}
                rows={2}
              />

              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(false)} className="text-[13px] text-ink-secondary hover:underline">
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={savingEdit} className={btnPrimary}>
                  {t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
