"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";
import { calculateAge } from "@/lib/age";
import IncidentFormModal from "@/components/health/IncidentFormModal";

type EventBasic = { id: string; name: string };

type Participant = {
  id: string;
  name: string;
  groupName: string | null;
  dateOfBirth: string | null;
};

type GuardianDraft = {
  name: string;
  email: string;
  relationship: string;
};

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

function emptyGuardian(): GuardianDraft {
  return { name: "", email: "", relationship: "" };
}

export default function EventHealthPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useTranslations();

  const [event, setEvent] = useState<EventBasic | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [allergies, setAllergies] = useState("");
  const [medsNotes, setMedsNotes] = useState("");
  const [chronicIssues, setChronicIssues] = useState("");
  const [otherNotes, setOtherNotes] = useState("");
  const [guardians, setGuardians] = useState<GuardianDraft[]>([emptyGuardian()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [incidentParticipantId, setIncidentParticipantId] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkFailures, setBulkFailures] = useState<{ name: string; error: string }[]>([]);

  async function load() {
    setLoading(true);
    const [evRes, partRes] = await Promise.all([
      fetch(`/api/events/${id}`),
      fetch(`/api/events/${id}/participants`),
    ]);
    if (evRes.ok) setEvent(await evRes.json());
    if (partRes.ok) setParticipants(await partRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  const filteredParticipants = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return participants;
    return participants.filter((p) => p.name.toLowerCase().includes(query));
  }, [participants, searchQuery]);

  function openForm() {
    setError(null);
    setName("");
    setGroupName("");
    setDateOfBirth("");
    setAllergies("");
    setMedsNotes("");
    setChronicIssues("");
    setOtherNotes("");
    setGuardians([emptyGuardian()]);
    setFormOpen(true);
  }

  function updateGuardian(index: number, patch: Partial<GuardianDraft>) {
    setGuardians((prev) => prev.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }

  function addGuardianRow() {
    setGuardians((prev) => [...prev, emptyGuardian()]);
  }

  function removeGuardianRow(index: number) {
    setGuardians((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;

    const guardianPayload = guardians
      .filter((g) => g.email.trim())
      .map((g) => ({
        name: g.name.trim() || undefined,
        email: g.email.trim(),
        relationship: g.relationship.trim() || undefined,
      }));

    setSaving(true);
    const res = await fetch(`/api/events/${id}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        groupName: groupName.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
        allergies: allergies.trim() || undefined,
        medsNotes: medsNotes.trim() || undefined,
        chronicIssues: chronicIssues.trim() || undefined,
        otherNotes: otherNotes.trim() || undefined,
        guardians: guardianPayload,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      setError(t("participantsPage.errorAddFailed"));
      return;
    }

    setFormOpen(false);
    load();
  }

  function toggleSelect(participantId: string) {
    const next = new Set(selected);
    if (next.has(participantId)) next.delete(participantId);
    else next.add(participantId);
    setSelected(next);
  }

  const allVisibleSelected =
    filteredParticipants.length > 0 && filteredParticipants.every((p) => selected.has(p.id));

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredParticipants.map((p) => p.id)));
    }
  }

  async function runBulkDelete() {
    if (selected.size === 0) return;
    const ok = window.confirm(t("participantsPage.confirmBulkDelete", { count: String(selected.size) }));
    if (!ok) return;

    setBulkRunning(true);
    setBulkMessage(null);
    setBulkFailures([]);
    setError(null);

    const res = await fetch(`/api/events/${id}/participants/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", participantIds: Array.from(selected) }),
    });

    if (!res.ok) {
      setError(t("participantsPage.bulkFailed"));
      setBulkRunning(false);
      return;
    }

    const data = await res.json();
    setBulkMessage(
      t("participantsPage.bulkResult", {
        succeeded: String(data.succeededCount),
        failed: String(data.failedCount),
      })
    );
    setBulkFailures(data.failed || []);
    setSelected(new Set());
    setBulkRunning(false);
    load();
  }

  if (loading) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  if (!event) return <div className="p-8 text-[14px] text-ink-secondary">{t("eventDetail.notFound")}</div>;

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <a href={`/events/${id}`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("billsPage.back")}
      </a>

      <h1 className="mb-5 mt-2 text-[22px] font-semibold text-ink">
        {event.name} — {t("participantsPage.title")} ({participants.length})
      </h1>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
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
        <a
          href={`/events/${id}/health/send-summaries`}
          className="rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2"
        >
          {t("bulkSendSummaries.entryPoint")}
        </a>
        <button onClick={openForm} className={btnPrimary}>
          {t("participantsPage.addButton")}
        </button>
      </div>

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-mist bg-paper-2 p-3">
          <span className="text-[14px] font-medium text-ink">
            {t("participantsPage.selectedCount", { count: String(selected.size) })}
          </span>
          <button
            onClick={runBulkDelete}
            disabled={bulkRunning}
            className="rounded-lg border border-red-300 bg-paper px-3 py-1.5 text-[13px] text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {bulkRunning ? t("common.loading") : t("participantsPage.bulkDeleteButton")}
          </button>
        </div>
      )}

      {bulkMessage && (
        <div className="mb-4 text-[13px] text-ink">
          <p>{bulkMessage}</p>
          {bulkFailures.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-red-600">
              {bulkFailures.map((f, i) => (
                <li key={i}>{f.name}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {filteredParticipants.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">
          {searchQuery ? t("participantsPage.searchNoMatches") : t("participantsPage.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse">
            <thead>
              <tr className="border-b border-mist text-left">
                <th className="p-2">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} />
                </th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("common.name")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.colGroup")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.colAge")}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredParticipants.map((p) => {
                const age = calculateAge(p.dateOfBirth);
                return (
                  <tr key={p.id} className="border-b border-mist/60 hover:bg-paper-2">
                    <td className="p-2">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                    </td>
                    <td className="p-2 text-[14px]">
                      <a href={`/events/${id}/health/participants/${p.id}`} className="text-ember hover:underline">
                        {p.name}
                      </a>
                    </td>
                    <td className="p-2 text-[14px] text-ink-secondary">{p.groupName || "—"}</td>
                    <td className="p-2 text-[14px] text-ink-secondary">{age !== null ? age : "—"}</td>
                    <td className="whitespace-nowrap p-2 text-right">
                      <button
                        onClick={() => setIncidentParticipantId(p.id)}
                        className="text-[13px] text-ember hover:underline"
                      >
                        {t("participantsPage.addIncidentButton")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-paper p-5">
            <h2 className="mb-4 text-[16px] font-semibold text-ink">{t("participantsPage.addButton")}</h2>

            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <input
                type="text"
                placeholder={t("common.name")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                autoFocus
              />
              <input
                type="text"
                placeholder={t("participantsPage.colGroup")}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className={inputClass}
              />
              <label className="text-[13px] text-ink-secondary">
                {t("participantsPage.dobLabel")}
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className={inputClass + " mt-1"}
                />
              </label>
              <textarea
                placeholder={t("participantDetail.allergiesLabel")}
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                className={inputClass}
                rows={2}
              />
              <textarea
                placeholder={t("participantDetail.medsNotesLabel")}
                value={medsNotes}
                onChange={(e) => setMedsNotes(e.target.value)}
                className={inputClass}
                rows={2}
              />
              <textarea
                placeholder={t("participantDetail.chronicIssuesLabel")}
                value={chronicIssues}
                onChange={(e) => setChronicIssues(e.target.value)}
                className={inputClass}
                rows={2}
              />
              <textarea
                placeholder={t("participantDetail.otherNotesLabel")}
                value={otherNotes}
                onChange={(e) => setOtherNotes(e.target.value)}
                className={inputClass}
                rows={2}
              />

              <h3 className="mt-2 text-[14px] font-medium text-ink">{t("participantDetail.guardiansTitle")}</h3>
              {guardians.map((g, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-mist p-2">
                  <input
                    type="text"
                    placeholder={t("common.name")}
                    value={g.name}
                    onChange={(e) => updateGuardian(i, { name: e.target.value })}
                    className={inputClass + " flex-1"}
                  />
                  <input
                    type="email"
                    placeholder={t("participantDetail.guardianEmailLabel")}
                    value={g.email}
                    onChange={(e) => updateGuardian(i, { email: e.target.value })}
                    className={inputClass + " flex-1"}
                  />
                  <input
                    type="text"
                    placeholder={t("participantDetail.guardianRelationshipLabel")}
                    value={g.relationship}
                    onChange={(e) => updateGuardian(i, { relationship: e.target.value })}
                    className={inputClass + " flex-1"}
                  />
                  {guardians.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeGuardianRow(i)}
                      className="text-[13px] text-red-600 hover:underline"
                    >
                      {t("common.delete")}
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addGuardianRow}
                className="self-start text-[13px] text-ember hover:underline"
              >
                {t("participantDetail.addGuardianButton")}
              </button>

              {error && <p className="text-[13px] text-red-600">{error}</p>}

              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setFormOpen(false)} className="text-[13px] text-ink-secondary hover:underline">
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={saving} className={btnPrimary}>
                  {t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {incidentParticipantId && (
        <IncidentFormModal
          eventId={id}
          participantId={incidentParticipantId}
          mode="new"
          onClose={() => setIncidentParticipantId(null)}
          onSaved={() => setIncidentParticipantId(null)}
        />
      )}
    </div>
  );
}
