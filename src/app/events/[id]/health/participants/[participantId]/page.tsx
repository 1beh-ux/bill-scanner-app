"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import IncidentFormModal, { type IncidentClientData } from "@/components/health/IncidentFormModal";
import IncidentDetailModal from "@/components/health/IncidentDetailModal";
import SendSummaryModal from "@/components/health/SendSummaryModal";
import ParentEmailLogTable, { type EmailLogRow } from "@/components/health/ParentEmailLogTable";
import { calculateAge } from "@/lib/age";
import { type ParticipantFieldDef } from "@/lib/participant-fields";
import { useConfirm } from "@/components/ConfirmDialog";

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
  dateOfBirth: string | null;
  customFieldValues: Record<string, string> | null;
  guardians: Guardian[];
};

type IncidentWithFollowUps = IncidentClientData & { followUps: IncidentClientData[] };

type NamedListItem = { id: string; name: string };
type MedPlan = {
  id: string;
  dose: string | null;
  notes: string | null;
  active: boolean;
  eventMed: NamedListItem;
  eventSlot: NamedListItem;
};

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

function incidentMeta(inc: IncidentClientData): string {
  const parts: string[] = [];
  parts.push(new Date(inc.incidentDate).toLocaleDateString("cs-CZ"));
  if (inc.incidentTime) parts.push(inc.incidentTime);
  if (inc.tempC) parts.push(`${inc.tempC} °C`);
  if (inc.pillName) parts.push(inc.pillName);
  return parts.join(" · ");
}

export default function ParticipantDetailPage({
  params,
}: {
  params: Promise<{ id: string; participantId: string }>;
}) {
  const { id: eventId, participantId } = use(params);
  const [driveFolderError, setDriveFolderError] = useState<string | null>(null);
  const { t } = useTranslations();
  const confirm = useConfirm();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const [participant, setParticipant] = useState<ParticipantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<ParticipantFieldDef[]>([]);
  const [editCustomFieldValues, setEditCustomFieldValues] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [addingGuardian, setAddingGuardian] = useState(false);
  const [gName, setGName] = useState("");
  const [gEmail, setGEmail] = useState("");
  const [gRelationship, setGRelationship] = useState("");
  const [savingGuardian, setSavingGuardian] = useState(false);

  const [incidents, setIncidents] = useState<IncidentWithFollowUps[]>([]);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [addingIncident, setAddingIncident] = useState(false);
  const [detailIncident, setDetailIncident] = useState<IncidentClientData | null>(null);
  const [followUpParent, setFollowUpParent] = useState<IncidentClientData | null>(null);

  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [emailLogs, setEmailLogs] = useState<EmailLogRow[]>([]);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const [medPlans, setMedPlans] = useState<MedPlan[]>([]);
  const [eventMeds, setEventMeds] = useState<NamedListItem[]>([]);
  const [eventSlots, setEventSlots] = useState<NamedListItem[]>([]);
  const [addingMedPlan, setAddingMedPlan] = useState(false);
  const [planMedId, setPlanMedId] = useState("");
  const [planSlotId, setPlanSlotId] = useState("");
  const [planDose, setPlanDose] = useState("");
  const [planNotes, setPlanNotes] = useState("");
  const [savingMedPlan, setSavingMedPlan] = useState(false);

  async function loadMedPlans() {
    const [plansRes, medsRes, slotsRes] = await Promise.all([
      fetch(`/api/participants/${participantId}/med-plans`),
      fetch(`/api/events/${eventId}/list-items?kind=med`),
      fetch(`/api/events/${eventId}/list-items?kind=slot`),
    ]);
    if (plansRes.ok) setMedPlans(await plansRes.json());
    if (medsRes.ok) setEventMeds(await medsRes.json());
    if (slotsRes.ok) setEventSlots(await slotsRes.json());
  }

  async function handleAddMedPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!planMedId || !planSlotId) return;
    setSavingMedPlan(true);
    await fetch(`/api/participants/${participantId}/med-plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventMedId: planMedId,
        eventSlotId: planSlotId,
        dose: planDose.trim() || undefined,
        notes: planNotes.trim() || undefined,
      }),
    });
    setSavingMedPlan(false);
    setPlanMedId("");
    setPlanSlotId("");
    setPlanDose("");
    setPlanNotes("");
    setAddingMedPlan(false);
    loadMedPlans();
  }

  async function toggleMedPlanActive(plan: MedPlan) {
    await fetch(`/api/participants/${participantId}/med-plans/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !plan.active }),
    });
    loadMedPlans();
  }

  async function removeMedPlan(planId: string) {
    if (!(await confirm({ message: t("medPlansSection.confirmRemove"), danger: true }))) return;
    await fetch(`/api/participants/${participantId}/med-plans/${planId}`, { method: "DELETE" });
    loadMedPlans();
  }

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/participants/${participantId}`);
    if (res.ok) setParticipant(await res.json());
    setLoading(false);
  }

  async function loadFields() {
    const res = await fetch(`/api/events/${eventId}/participant-fields?surface=health_detail`);
    if (res.ok) setFields(await res.json());
  }

  async function loadIncidents() {
    const res = await fetch(`/api/participants/${participantId}/incidents`);
    if (res.ok) setIncidents(await res.json());
  }

  async function loadEmailLogs() {
    const res = await fetch(`/api/participants/${participantId}/emails`);
    if (res.ok) setEmailLogs(await res.json());
  }

  async function handleResend(log: EmailLogRow) {
    setResendingId(log.id);
    await fetch(`/api/participants/${participantId}/emails/${log.id}/resend`, { method: "POST" });
    setResendingId(null);
    loadEmailLogs();
  }

  useEffect(() => {
    load();
    loadFields();
    loadIncidents();
    loadMedPlans();
    loadEmailLogs();
  }, [participantId]);

  function handleIncidentChanged() {
    loadIncidents();
    setDetailIncident(null);
  }

  function toggleCollapsed(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startEdit() {
    if (!participant) return;
    setError(null);
    setEditCustomFieldValues({ ...(participant.customFieldValues ?? {}) });
    setEditing(true);
  }

  function setEditFieldValue(key: string, value: string) {
    setEditCustomFieldValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleDeleteParticipant() {
    if (!participant) return;
    if (!(await confirm({ message: t("participantDetail.confirmDeleteParticipant", { name: participant.name }), danger: true }))) return;
    setDeleting(true);
    const res = await fetch(`/api/participants/${participantId}`, { method: "DELETE" });
    if (!res.ok) {
      setDeleting(false);
      setError(t("participantDetail.errorDeleteFailed"));
      return;
    }
    router.push(`/events/${eventId}/health`);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSavingEdit(true);
    setError(null);
    const res = await fetch(`/api/participants/${participantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customFieldValues: editCustomFieldValues,
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
    if (!(await confirm({ message: t("participantDetail.confirmRemoveGuardian"), danger: true }))) return;
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

  async function openDriveFolder() {
    // Opened up front, then pointed at the folder: a window opened only after
    // the request would be blocked as an unrequested popup.
    const win = window.open("", "_blank");
    setDriveFolderError(null);
    const res = await fetch(`/api/participants/${participantId}/drive-folder`, { method: "POST" });
    if (!res.ok) {
      win?.close();
      const data = await res.json().catch(() => ({}));
      setDriveFolderError(t(data.error === "no_participants_folder" ? "participantDetail.driveFolderNotSet" : "participantDetail.driveFolderFailed"));
      return;
    }
    const { url } = await res.json();
    if (win) win.location.href = url;
  }

  if (loading) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  if (!participant) return <div className="p-8 text-[14px] text-ink-secondary">{t("eventDetail.notFound")}</div>;

  const hasNotes = fields.some((f) => participant.customFieldValues?.[f.key]);

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <a href={`/events/${eventId}/health`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("participantsPage.title")}
      </a>

      <div className="mb-4 mt-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">{participant.name}</h1>
          <p className="text-[14px] text-ink-secondary">
            {[
              participant.groupName,
              participant.dateOfBirth
                ? `${new Date(participant.dateOfBirth).toLocaleDateString("cs-CZ")} (${calculateAge(participant.dateOfBirth)} let)`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <button onClick={openDriveFolder} className="mt-1 text-[13px] text-ember hover:underline">
            {t("participantDetail.openDriveFolder")}
          </button>
          {driveFolderError && <p className="mt-1 text-[12px] text-red-600">{driveFolderError}</p>}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setSendModalOpen(true)} className="text-[13px] text-ember hover:underline">
            {t("sendSummary.sendButtonShort")}
          </button>
          <a
            href={`/api/participants/${participantId}/summary-pdf`}
            className="text-[13px] text-ink-secondary hover:text-ink"
          >
            {t("participantDetail.downloadPdfButton")}
          </a>
          <a href={`/events/${eventId}/participants?edit=${participantId}`} className="text-[13px] text-ember hover:underline">
            {t("participantsPage.editCoreDetailsLink")}
          </a>
          <button onClick={startEdit} className="text-[13px] text-ember hover:underline">
            {t("participantDetail.editNotesButton")}
          </button>
          <button
            onClick={handleDeleteParticipant}
            disabled={deleting}
            className="text-[13px] text-red-600 hover:underline disabled:opacity-50"
          >
            {t("common.delete")}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-[14px] text-red-600">{error}</p>}

      <h2 className="mb-2 text-[16px] font-semibold text-ink">{t("participantDetail.notesTitle")}</h2>
      {hasNotes ? (
        <div className="mb-6 flex flex-col gap-2 rounded-lg border border-mist bg-paper-2 p-3 text-[14px] text-ink">
          {fields.map(
            (f) =>
              participant.customFieldValues?.[f.key] && (
                <p key={f.id}>
                  <strong>{f.label}:</strong> {participant.customFieldValues[f.key]}
                </p>
              )
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

      <div className="mb-3 mt-6 flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-ink">{t("medPlansSection.title")}</h2>
        <button onClick={() => setAddingMedPlan((v) => !v)} className="text-[13px] text-ember hover:underline">
          {t("medPlansSection.addButton")}
        </button>
      </div>

      {addingMedPlan && (
        <form
          onSubmit={handleAddMedPlan}
          className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-mist p-2"
        >
          <select value={planMedId} onChange={(e) => setPlanMedId(e.target.value)} className={inputClass + " flex-1"}>
            <option value="">{t("medPlansSection.selectMed")}</option>
            {eventMeds.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select value={planSlotId} onChange={(e) => setPlanSlotId(e.target.value)} className={inputClass + " flex-1"}>
            <option value="">{t("medPlansSection.selectSlot")}</option>
            {eventSlots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder={t("medPlansSection.doseLabel")}
            value={planDose}
            onChange={(e) => setPlanDose(e.target.value)}
            className={inputClass + " flex-1"}
          />
          <input
            type="text"
            placeholder={t("participantDetail.otherNotesLabel")}
            value={planNotes}
            onChange={(e) => setPlanNotes(e.target.value)}
            className={inputClass + " flex-1"}
          />
          <button type="submit" disabled={savingMedPlan} className={btnPrimary}>
            {t("common.save")}
          </button>
        </form>
      )}

      {medPlans.length === 0 ? (
        <p className="mb-6 text-[14px] text-ink-secondary">{t("medPlansSection.empty")}</p>
      ) : (
        <div className="mb-6 flex flex-col gap-2">
          {medPlans.map((plan) => (
            <div
              key={plan.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-mist/60 p-2"
            >
              <div className={"text-[14px] " + (plan.active ? "text-ink" : "text-ink-secondary line-through")}>
                {plan.eventMed.name} · {plan.eventSlot.name}
                {plan.dose && <span className="text-ink-secondary"> · {plan.dose}</span>}
                {plan.notes && <span className="text-ink-secondary"> · {plan.notes}</span>}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => toggleMedPlanActive(plan)} className="text-[12px] text-ink-secondary hover:text-ink">
                  {plan.active ? t("listTemplateAdmin.deactivate") : t("listTemplateAdmin.activate")}
                </button>
                <button onClick={() => removeMedPlan(plan.id)} className="text-[13px] text-red-600 hover:underline">
                  {t("common.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 mt-6 flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-ink">{t("incidentsPage.title")}</h2>
        <button onClick={() => setAddingIncident(true)} className="text-[13px] text-ember hover:underline">
          {t("incidentsPage.addButton")}
        </button>
      </div>

      {incidents.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("incidentsPage.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {incidents.map((inc) => (
            <div key={inc.id} className="rounded-lg border border-mist/60 p-2">
              <div
                onClick={() => setDetailIncident(inc)}
                className="flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-lg hover:bg-paper-2"
              >
                <div className="text-[14px] text-ink">
                  <span className="mr-2 rounded-full bg-paper-2 px-2 py-0.5 text-[12px] text-ink-secondary">
                    {t(`incidentForm.category.${inc.category}`)}
                  </span>
                  {inc.actionSummary}
                  <div className="text-[12px] text-ink-secondary">{incidentMeta(inc)}</div>
                </div>
                <div className="flex items-center gap-2">
                  {inc.followUps.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCollapsed(inc.id);
                      }}
                      className="text-[12px] text-ink-secondary hover:text-ink"
                    >
                      {collapsedIds.has(inc.id)
                        ? t("incidentsPage.showFollowUps", { count: String(inc.followUps.length) })
                        : t("incidentsPage.hideFollowUps")}
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFollowUpParent(inc);
                    }}
                    className="text-[13px] text-ember hover:underline"
                  >
                    {t("incidentsPage.followUpButton")}
                  </button>
                </div>
              </div>

              {inc.followUps.length > 0 && !collapsedIds.has(inc.id) && (
                <div className="ml-4 mt-2 flex flex-col gap-1.5 border-l border-mist pl-3">
                  {inc.followUps.map((fu) => (
                    <div
                      key={fu.id}
                      onClick={() => setDetailIncident(fu)}
                      className="cursor-pointer rounded-lg p-1 hover:bg-paper-2"
                    >
                      <div className="text-[13px] text-ink-secondary">{fu.actionSummary}</div>
                      <div className="text-[12px] text-ink-secondary">{incidentMeta(fu)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-6 text-[16px] font-semibold text-ink">{t("sendLog.title")}</h2>
      <ParentEmailLogTable logs={emailLogs} onResend={handleResend} resendingId={resendingId} />

      {sendModalOpen && (
        <SendSummaryModal
          participantId={participantId}
          onClose={() => setSendModalOpen(false)}
          onSent={loadEmailLogs}
        />
      )}

      {addingIncident && (
        <IncidentFormModal
          eventId={eventId}
          participantId={participantId}
          mode="new"
          onClose={() => setAddingIncident(false)}
          onSaved={loadIncidents}
        />
      )}

      {followUpParent && (
        <IncidentFormModal
          eventId={eventId}
          participantId={participantId}
          mode="follow-up"
          incident={followUpParent}
          onClose={() => setFollowUpParent(null)}
          onSaved={loadIncidents}
        />
      )}

      {detailIncident && (
        <IncidentDetailModal
          eventId={eventId}
          participantId={participantId}
          incident={detailIncident}
          onClose={() => setDetailIncident(null)}
          onChanged={handleIncidentChanged}
        />
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-paper p-5">
            <h2 className="mb-4 text-[16px] font-semibold text-ink">{t("participantDetail.editNotesButton")}</h2>
            <form onSubmit={saveEdit} className="flex flex-col gap-3">
              {fields.map((f, i) => (
                <HealthFieldInput
                  key={f.id}
                  field={f}
                  value={editCustomFieldValues[f.key] ?? ""}
                  onChange={(v) => setEditFieldValue(f.key, v)}
                  autoFocus={i === 0}
                />
              ))}

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

// Text-type fields render as a multi-line textarea here specifically --
// this page is about longer clinical notes, unlike the central roster's
// single-line FieldInput (src/app/events/[id]/participants/page.tsx),
// which is a different screen with a different typical field shape.
function HealthFieldInput({
  field,
  value,
  onChange,
  autoFocus,
}: {
  field: ParticipantFieldDef;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  if (field.fieldType === "boolean") {
    return (
      <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
        <input type="checkbox" checked={value === "true"} onChange={(e) => onChange(String(e.target.checked))} autoFocus={autoFocus} />
        {field.label}
      </label>
    );
  }
  if (field.fieldType === "select") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} autoFocus={autoFocus}>
        <option value="">{field.label}</option>
        {(field.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  if (field.fieldType === "number" || field.fieldType === "date") {
    return (
      <input
        type={field.fieldType}
        placeholder={field.label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
        autoFocus={autoFocus}
      />
    );
  }
  return (
    <textarea
      placeholder={field.label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
      rows={2}
      autoFocus={autoFocus}
    />
  );
}
