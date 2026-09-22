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
  phone: string | null;
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

type ParticipantDocumentRow = {
  id: string;
  docTypeName: string;
  filename: string | null;
  receivedAt: string;
  receivedVia: string;
  driveUrl: string | null;
};

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
const btnSecondary =
  "rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2 disabled:opacity-50";

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
  const [hasDriveFolder, setHasDriveFolder] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);

  const [participant, setParticipant] = useState<ParticipantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fields, setFields] = useState<ParticipantFieldDef[]>([]);

  const [addingGuardian, setAddingGuardian] = useState(false);
  const [gName, setGName] = useState("");
  const [gEmail, setGEmail] = useState("");
  const [gRelationship, setGRelationship] = useState("");
  const [gPhone, setGPhone] = useState("");
  // Part 7: guardians are now editable in place here too (not just add/delete), same
  // as the central roster (Part 2) -- a per-row draft, saved with its own PATCH.
  const [editGuardianId, setEditGuardianId] = useState<string | null>(null);
  const [editGuardianDraft, setEditGuardianDraft] = useState<Guardian | null>(null);
  const [savingGuardian, setSavingGuardian] = useState(false);

  const [incidents, setIncidents] = useState<IncidentWithFollowUps[]>([]);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [addingIncident, setAddingIncident] = useState(false);
  const [detailIncident, setDetailIncident] = useState<IncidentClientData | null>(null);
  const [followUpParent, setFollowUpParent] = useState<IncidentClientData | null>(null);

  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [emailLogs, setEmailLogs] = useState<EmailLogRow[]>([]);
  const [documents, setDocuments] = useState<ParticipantDocumentRow[]>([]);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const [medPlans, setMedPlans] = useState<MedPlan[]>([]);
  const [eventMeds, setEventMeds] = useState<NamedListItem[]>([]);
  const [eventSlots, setEventSlots] = useState<NamedListItem[]>([]);
  const [addingMedPlan, setAddingMedPlan] = useState(false);
  // Part 3: a combobox, not a plain dropdown -- typing a name not yet in the event
  // catalogue creates it on the fly (POST .../list-items) so an empty catalogue is
  // never a dead end; matching an existing name (case-insensitive) reuses that item.
  const [planMedName, setPlanMedName] = useState("");
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
    const name = planMedName.trim();
    if (!name || !planSlotId) return;
    setSavingMedPlan(true);

    let eventMedId = eventMeds.find((m) => m.name.trim().toLowerCase() === name.toLowerCase())?.id;
    if (!eventMedId) {
      const created = await fetch(`/api/events/${eventId}/list-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "med", name }),
      });
      if (created.ok) {
        const item = (await created.json()) as NamedListItem;
        eventMedId = item.id;
      }
    }
    if (eventMedId) {
      await fetch(`/api/participants/${participantId}/med-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventMedId,
          eventSlotId: planSlotId,
          dose: planDose.trim() || undefined,
          notes: planNotes.trim() || undefined,
        }),
      });
    }
    setSavingMedPlan(false);
    setPlanMedName("");
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

  async function loadDocuments() {
    const res = await fetch(`/api/participants/${participantId}/documents`);
    if (res.ok) setDocuments(await res.json());
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
    loadDocuments();
    // Part 7: "Otevřít složku na Disku" only shows when it would actually work --
    // folders are created lazily on first click, so the real prerequisite is
    // just whether the event has a participants-root (or export) folder set.
    fetch(`/api/events/${eventId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { driveParticipantsFolderId: string | null; driveExportFolderId: string | null } | null) =>
        setHasDriveFolder(!!(d?.driveParticipantsFolderId || d?.driveExportFolderId))
      )
      .catch(() => {});
  }, [participantId, eventId]);

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
        phone: gPhone.trim() || undefined,
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
    setGPhone("");
    setAddingGuardian(false);
    load();
  }

  async function removeGuardian(guardianId: string) {
    if (!(await confirm({ message: t("participantDetail.confirmRemoveGuardian"), danger: true }))) return;
    await fetch(`/api/participants/${participantId}/guardians/${guardianId}`, { method: "DELETE" });
    load();
  }

  function startEditGuardian(g: Guardian) {
    setEditGuardianId(g.id);
    setEditGuardianDraft({ ...g });
  }

  async function saveEditGuardian() {
    if (!editGuardianDraft) return;
    setSavingGuardian(true);
    await fetch(`/api/participants/${participantId}/guardians/${editGuardianDraft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editGuardianDraft.name?.trim() || null,
        email: editGuardianDraft.email.trim(),
        relationship: editGuardianDraft.relationship?.trim() || null,
        phone: editGuardianDraft.phone?.trim() || null,
      }),
    });
    setSavingGuardian(false);
    setEditGuardianId(null);
    setEditGuardianDraft(null);
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

  // medsNotes gets its own dedicated block (with "Převést na plán") above the med plan
  // list -- excluded here so it isn't shown twice.
  const generalNoteFields = fields.filter((f) => f.key !== "medsNotes");
  const hasNotes = generalNoteFields.some((f) => participant.customFieldValues?.[f.key]);

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
          {hasDriveFolder && (
            <button onClick={openDriveFolder} className="mt-1 text-[13px] text-ember hover:underline">
              {t("participantDetail.openDriveFolder")}
            </button>
          )}
          {driveFolderError && <p className="mt-1 text-[12px] text-red-600">{driveFolderError}</p>}
        </div>
        {/* Part 7: primary actions as buttons; "Upravit" now opens the central roster's
            section editor (Part 2), which already covers both core fields and Zdravotní
            poznámky -- no separate inline notes editor here anymore. Smazat moved into
            the overflow menu, confirmed with the shared dialog either way. */}
        <div className="flex items-center gap-2">
          <button onClick={() => setSendModalOpen(true)} className={btnPrimary}>
            {t("sendSummary.sendButtonShort")}
          </button>
          <a href={`/api/participants/${participantId}/summary-pdf`} className={btnSecondary}>
            {t("participantDetail.downloadPdfButton")}
          </a>
          <a href={`/events/${eventId}/participants?edit=${participantId}`} className={btnSecondary}>
            {t("common.edit")}
          </a>
          <div className="relative">
            <button
              onClick={() => setOverflowOpen((v) => !v)}
              aria-label={t("common.moreActions")}
              className="rounded-lg border border-mist bg-paper px-2.5 py-2 text-[14px] text-ink-secondary hover:bg-paper-2"
            >
              ⋯
            </button>
            {overflowOpen && (
              <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-mist bg-paper py-1 shadow-lg">
                <button
                  onClick={() => {
                    setOverflowOpen(false);
                    handleDeleteParticipant();
                  }}
                  disabled={deleting}
                  className="block w-full px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-paper-2 disabled:opacity-50"
                >
                  {t("common.delete")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <p className="mb-4 text-[14px] text-red-600">{error}</p>}

      <h2 className="mb-2 text-[16px] font-semibold text-ink">{t("participantDetail.notesTitle")}</h2>
      {hasNotes ? (
        <div className="mb-6 flex flex-col gap-2 rounded-lg border border-mist bg-paper-2 p-3 text-[14px] text-ink">
          {generalNoteFields.map(
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

      {/* Part 11-D: what the inbox (or a manual mark) saved, checkable without opening
          Drive. Grouped by document type, "Typ — N souborů" (Part 11-C's own wording),
          each file with its received date/source and a Drive link when synced. */}
      <h2 className="mb-2 text-[16px] font-semibold text-ink">{t("participantDetail.documentsTitle")}</h2>
      {documents.length === 0 ? (
        <p className="mb-6 text-[14px] text-ink-secondary">{t("participantDetail.documentsEmpty")}</p>
      ) : (
        <div className="mb-6 flex flex-col gap-3">
          {Object.entries(
            documents.reduce<Record<string, ParticipantDocumentRow[]>>((acc, d) => {
              (acc[d.docTypeName] ??= []).push(d);
              return acc;
            }, {})
          ).map(([docTypeName, files]) => (
            <div key={docTypeName} className="rounded-lg border border-mist/60 p-2">
              <p className="mb-1 text-[13px] font-medium text-ink">
                {t("participantDetail.documentsFileCount", { name: docTypeName, count: String(files.length) })}
              </p>
              <ul className="flex flex-col gap-0.5">
                {files.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2 text-[12px] text-ink-secondary">
                    <span>{f.filename || "—"}</span>
                    <span>· {new Date(f.receivedAt).toLocaleDateString("cs-CZ")}</span>
                    <span>· {t(`participantDetail.documentsVia.${f.receivedVia}`)}</span>
                    {f.driveUrl && (
                      <a href={f.driveUrl} target="_blank" rel="noreferrer" className="text-ember hover:underline">
                        {t("participantDetail.documentsOpenInDrive")}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
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
          <input
            type="tel"
            placeholder={t("participantDetail.guardianPhoneLabel")}
            value={gPhone}
            onChange={(e) => setGPhone(e.target.value)}
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
          {participant.guardians.map((g) =>
            editGuardianId === g.id && editGuardianDraft ? (
              <div key={g.id} className="flex flex-col gap-2 rounded-lg border border-mist p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder={t("common.name")}
                    value={editGuardianDraft.name ?? ""}
                    onChange={(e) => setEditGuardianDraft({ ...editGuardianDraft, name: e.target.value })}
                    className={inputClass + " flex-1"}
                  />
                  <input
                    type="email"
                    placeholder={t("participantDetail.guardianEmailLabel")}
                    value={editGuardianDraft.email}
                    onChange={(e) => setEditGuardianDraft({ ...editGuardianDraft, email: e.target.value })}
                    className={inputClass + " flex-1"}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder={t("participantDetail.guardianRelationshipLabel")}
                    value={editGuardianDraft.relationship ?? ""}
                    onChange={(e) => setEditGuardianDraft({ ...editGuardianDraft, relationship: e.target.value })}
                    className={inputClass + " flex-1"}
                  />
                  <input
                    type="tel"
                    placeholder={t("participantDetail.guardianPhoneLabel")}
                    value={editGuardianDraft.phone ?? ""}
                    onChange={(e) => setEditGuardianDraft({ ...editGuardianDraft, phone: e.target.value })}
                    className={inputClass + " flex-1"}
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setEditGuardianId(null)} className="text-[13px] text-ink-secondary hover:underline">
                    {t("common.cancel")}
                  </button>
                  <button onClick={saveEditGuardian} disabled={savingGuardian} className="text-[13px] text-ember hover:underline">
                    {t("common.save")}
                  </button>
                </div>
              </div>
            ) : (
              <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-mist/60 p-2">
                <div className="text-[14px] text-ink">
                  {g.name || g.email}
                  {g.name && <span className="text-ink-secondary"> · {g.email}</span>}
                  {g.relationship && <span className="text-ink-secondary"> · {g.relationship}</span>}
                  {g.phone && <span className="text-ink-secondary"> · {g.phone}</span>}
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
                  <button onClick={() => startEditGuardian(g)} className="text-[13px] text-ember hover:underline">
                    {t("common.edit")}
                  </button>
                  <button
                    onClick={() => removeGuardian(g.id)}
                    className="text-[13px] text-red-600 hover:underline"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Part 3: the free-text "Léky uvedené v přihlášce" note (customFieldValues.medsNotes)
          stays read-only "as reported by parents" -- "Převést na plán" opens the plan add
          form prefilled with that text so the admin can turn it into a real plan row. */}
      {participant.customFieldValues?.medsNotes && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-mist bg-paper-2 p-3 text-[14px] text-ink">
          <p>
            <strong>{t("medPlansSection.reportedLabel")}:</strong> {participant.customFieldValues.medsNotes}
          </p>
          <button
            onClick={() => {
              setPlanNotes(participant.customFieldValues!.medsNotes!);
              setAddingMedPlan(true);
            }}
            className="text-[13px] text-ember hover:underline"
          >
            {t("medPlansSection.convertToPlanButton")}
          </button>
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
          <input
            type="text"
            list="med-plan-catalog"
            placeholder={t("medPlansSection.selectMed")}
            value={planMedName}
            onChange={(e) => setPlanMedName(e.target.value)}
            className={inputClass + " flex-1"}
          />
          <datalist id="med-plan-catalog">
            {eventMeds.map((m) => (
              <option key={m.id} value={m.name} />
            ))}
          </datalist>
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
                  {inc.bodyView && (
                    <span className="mr-2 rounded-full bg-paper-2 px-2 py-0.5 text-[12px] text-ink-secondary">
                      {t(inc.bodyView === "front" ? "bodyMap.front" : "bodyMap.back")}
                    </span>
                  )}
                  {inc.photoGcsPath && (
                    <span className="mr-2 text-[12px] text-ink-secondary" title={t("incidentForm.photoLabel")}>
                      📷
                    </span>
                  )}
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
                      <div className="text-[13px] text-ink-secondary">
                        {fu.photoGcsPath && (
                          <span className="mr-1" title={t("incidentForm.photoLabel")}>
                            📷
                          </span>
                        )}
                        {fu.actionSummary}
                      </div>
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

    </div>
  );
}
