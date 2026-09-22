"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";
import { calculateAge } from "@/lib/age";
import { formatFieldValue, type ParticipantFieldDef } from "@/lib/participant-fields";
import { FIXED_PARTICIPANT_FIELDS } from "@/lib/fixed-participant-fields";
import { fieldCategory } from "@/lib/participant-fields";
import ComposeEmailModal from "@/components/health/ComposeEmailModal";
import BulkStatusModal from "@/components/mail/BulkStatusModal";
import ColumnPicker from "@/components/ColumnPicker";
import { useConfirm } from "@/components/ConfirmDialog";

type EventBasic = { id: string; name: string; participantsListColumns: string[] | null };

type Participant = {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  groupName: string | null;
  dateOfBirth: string | null;
  registrationStatus: "pending" | "accepted";
  documentsTotal: number;
  documentsReceived: number;
  customFieldValues: Record<string, string> | null;
  guardian: { name: string | null; email: string; relationship: string | null; phone: string | null } | null;
  computed: { price: number | null; var_symb: string; contact_email: string };
};

// Resolves a guardian/computed field's display value for the roster --
// custom fields already go through customFieldValues, builtin fields never
// reach here (excluded from the column picker, see dynamicListFields below).
function resolveDynamicValue(field: ParticipantFieldDef, p: Participant): string {
  if (field.kind === "guardian") {
    const prop = FIXED_PARTICIPANT_FIELDS.find((f) => f.key === field.key)?.guardianProp;
    const raw = prop ? p.guardian?.[prop] : undefined;
    return raw || "—";
  }
  if (field.kind === "computed") {
    if (field.key === "price") return p.computed.price != null ? `${p.computed.price} Kč` : "—";
    if (field.key === "var_symb") return p.computed.var_symb || "—";
    if (field.key === "Email") return p.computed.contact_email || "—";
    return "—";
  }
  return formatFieldValue(p.customFieldValues?.[field.key], field.fieldType as "text" | "number" | "date" | "boolean" | "select");
}

type GuardianDraft = { name: string; email: string; relationship: string; phone: string };
// A saved guardian row shown in the edit panel -- edited and saved in place (own PATCH
// per row), not as part of the surrounding form submit.
type EditGuardian = { id: string; name: string; email: string; relationship: string; phone: string; receivesCommunications: boolean };

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const btnSecondary =
  "rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";

function emptyGuardian(): GuardianDraft {
  return { name: "", email: "", relationship: "", phone: "" };
}

export default function EventParticipantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useTranslations();
  const confirm = useConfirm();

  const [event, setEvent] = useState<EventBasic | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [moduleAccess, setModuleAccess] = useState<Record<string, boolean>>({});

  const [addOpen, setAddOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [guardians, setGuardians] = useState<GuardianDraft[]>([emptyGuardian()]);
  const [acceptImmediately, setAcceptImmediately] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editParticipant, setEditParticipant] = useState<Participant | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editGroup, setEditGroup] = useState("");
  const [editDob, setEditDob] = useState("");
  const [editCustomFieldValues, setEditCustomFieldValues] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  // Guardians (Part 2): loaded fresh from /core when the edit panel opens, each row
  // saved with its own PATCH -- separate from the surrounding form's single submit,
  // same immediate-save pattern already used for surface pills elsewhere on this page.
  const [editGuardians, setEditGuardians] = useState<EditGuardian[]>([]);
  const [newGuardianDraft, setNewGuardianDraft] = useState<GuardianDraft>(emptyGuardian());
  const [savingGuardianId, setSavingGuardianId] = useState<string | null>(null);

  // All active event fields (any surface) -- what the edit modal offers,
  // since editing a value shouldn't depend on where it happens to be
  // displayed (custom fields only -- guardian/computed values aren't
  // editable here, and builtin fields already have their own dedicated
  // inputs above).
  const [fields, setFields] = useState<ParticipantFieldDef[]>([]);
  // Part 2: the edit panel splits custom fields into "Údaje" (everything else) and
  // "Zdravotní poznámky" (Zdraví-category, only ever non-empty when Health is enabled
  // for the event -- allowedParticipantFieldKeys already keeps them out of `fields`
  // otherwise, see module-access.ts).
  const editableFields = useMemo(() => fields.filter((f) => f.kind === "custom" && fieldCategory(f.kind, f.surfaces) !== "health"), [fields]);
  const editableHealthFields = useMemo(() => fields.filter((f) => f.kind === "custom" && fieldCategory(f.kind, f.surfaces) === "health"), [fields]);
  // Every non-builtin field with the `list` surface -- candidates for the
  // roster's optional columns. builtin fields (Name/Group/DOB/status) and the
  // "Email" computed field are excluded: they're always shown via the dedicated
  // fixed columns below, so offering them here would just be a second,
  // disconnected toggle for the same thing.
  const dynamicListFields = useMemo(
    () => fields.filter((f) => f.kind !== "builtin" && f.key !== "Email" && f.surfaces.includes("list")),
    [fields]
  );
  // The actually-displayed columns: the saved order, filtered to fields
  // still eligible (deactivated/removed fields drop out silently), falling
  // back to "every eligible field, API order" when nothing's configured
  // yet -- the old always-on behavior.
  const activeColumns = useMemo(() => {
    const eligibleKeys = new Set(dynamicListFields.map((f) => f.key));
    const saved = (event?.participantsListColumns ?? []).filter((k) => eligibleKeys.has(k));
    const keys = saved.length > 0 ? saved : dynamicListFields.map((f) => f.key);
    return keys.map((k) => dynamicListFields.find((f) => f.key === k)!).filter(Boolean);
  }, [dynamicListFields, event]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const [notice, setNotice] = useState<{ warn: boolean; text: string } | null>(null);
  const [composeModal, setComposeModal] = useState<{ mode: "acceptance" | "freeform"; participantIds: string[]; alreadyAccepted?: boolean } | null>(
    null
  );
  const [statusModalOpen, setStatusModalOpen] = useState(false);

  async function load() {
    setLoading(true);
    const [evRes, partRes, fieldsRes] = await Promise.all([
      fetch(`/api/events/${id}`),
      fetch(`/api/events/${id}/participants`),
      fetch(`/api/events/${id}/participant-fields`),
    ]);
    if (evRes.ok) setEvent(await evRes.json());
    if (partRes.ok) setParticipants(await partRes.json());
    if (fieldsRes.ok) setFields(await fieldsRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch(`/api/events/${id}/modules/mine`)
      .then((r) => (r.ok ? r.json() : {}))
      .then(setModuleAccess)
      .catch(() => {});
  }, [id]);

  // Deep link from a participant's Health detail page ("Upravit údaje")
  // opens straight into that person's core-details edit modal here.
  useEffect(() => {
    if (loading) return;
    const editId = new URLSearchParams(window.location.search).get("edit");
    if (!editId) return;
    const p = participants.find((x) => x.id === editId);
    if (p) startEdit(p);
  }, [loading, participants]);

  const filteredParticipants = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return participants;
    return participants.filter((p) => p.name.toLowerCase().includes(query));
  }, [participants, searchQuery]);

  function openAdd() {
    setError(null);
    setFirstName("");
    setLastName("");
    setGroupName("");
    setDateOfBirth("");
    setGuardians([emptyGuardian()]);
    setAcceptImmediately(false);
    setAddOpen(true);
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
    if (!firstName.trim() && !lastName.trim()) return;

    const guardianPayload = guardians
      .filter((g) => g.email.trim())
      .map((g) => ({
        name: g.name.trim() || undefined,
        email: g.email.trim(),
        relationship: g.relationship.trim() || undefined,
        phone: g.phone.trim() || undefined,
      }));

    setSaving(true);
    const res = await fetch(`/api/events/${id}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        acceptImmediately,
        groupName: groupName.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
        guardians: guardianPayload,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      setError(t("participantsPage.errorAddFailed"));
      return;
    }
    setAddOpen(false);
    load();
  }

  function startEdit(p: Participant) {
    setError(null);
    setEditParticipant(p);
    // Not split yet (scripts/split-participant-names.ts hasn't run for this row, or left
    // it ambiguous) -- put the whole stored name in Příjmení rather than losing it from
    // the form; the admin can move the first name across by hand.
    setEditFirstName(p.firstName ?? "");
    setEditLastName(p.lastName ?? (p.firstName ? "" : p.name));
    setEditGroup(p.groupName ?? "");
    setEditDob(p.dateOfBirth ? p.dateOfBirth.slice(0, 10) : "");
    setEditCustomFieldValues({ ...(p.customFieldValues ?? {}) });
    setNewGuardianDraft(emptyGuardian());
    setEditGuardians([]);
    fetch(`/api/participants/${p.id}/core`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { guardians?: EditGuardian[] } | null) => {
        if (data?.guardians) {
          setEditGuardians(
            data.guardians.map((g) => ({
              id: g.id,
              name: g.name ?? "",
              email: g.email,
              relationship: g.relationship ?? "",
              phone: g.phone ?? "",
              receivesCommunications: g.receivesCommunications,
            }))
          );
        }
      })
      .catch(() => {});
  }

  function setEditFieldValue(key: string, value: string) {
    setEditCustomFieldValues((prev) => ({ ...prev, [key]: value }));
  }

  function updateEditGuardianDraft(id: string, patch: Partial<EditGuardian>) {
    setEditGuardians((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  async function saveEditGuardian(guardianId: string) {
    const g = editGuardians.find((x) => x.id === guardianId);
    if (!g || !editParticipant) return;
    setSavingGuardianId(guardianId);
    await fetch(`/api/participants/${editParticipant.id}/guardians/${guardianId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: g.name.trim() || null,
        email: g.email.trim(),
        relationship: g.relationship.trim() || null,
        phone: g.phone.trim() || null,
        receivesCommunications: g.receivesCommunications,
      }),
    });
    setSavingGuardianId(null);
    load();
  }

  async function deleteEditGuardian(guardianId: string) {
    if (!editParticipant) return;
    if (!(await confirm({ message: t("participantDetail.confirmDeleteGuardian"), danger: true }))) return;
    setSavingGuardianId(guardianId);
    await fetch(`/api/participants/${editParticipant.id}/guardians/${guardianId}`, { method: "DELETE" });
    setSavingGuardianId(null);
    // No reorder -- just drop the deleted row, everything else keeps its position.
    setEditGuardians((prev) => prev.filter((g) => g.id !== guardianId));
    load();
  }

  async function addEditGuardian() {
    if (!editParticipant || !newGuardianDraft.email.trim()) return;
    setSavingGuardianId("new");
    const res = await fetch(`/api/participants/${editParticipant.id}/guardians`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newGuardianDraft.name.trim() || undefined,
        email: newGuardianDraft.email.trim(),
        relationship: newGuardianDraft.relationship.trim() || undefined,
        phone: newGuardianDraft.phone.trim() || undefined,
      }),
    });
    setSavingGuardianId(null);
    if (!res.ok) return;
    const created = (await res.json()) as { id: string; name: string | null; email: string; relationship: string | null; phone: string | null; receivesCommunications: boolean };
    // New row always goes at the end -- existing rows never move.
    setEditGuardians((prev) => [
      ...prev,
      { id: created.id, name: created.name ?? "", email: created.email, relationship: created.relationship ?? "", phone: created.phone ?? "", receivesCommunications: created.receivesCommunications },
    ]);
    setNewGuardianDraft(emptyGuardian());
    load();
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editParticipant || (!editFirstName.trim() && !editLastName.trim())) return;
    setSavingEdit(true);
    setError(null);
    const res = await fetch(`/api/participants/${editParticipant.id}/core`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        groupName: editGroup.trim() || null,
        dateOfBirth: editDob || null,
        customFieldValues: editCustomFieldValues,
      }),
    });
    setSavingEdit(false);
    if (!res.ok) {
      setError(t("participantDetail.errorSaveFailed"));
      return;
    }
    setEditParticipant(null);
    load();
  }

  async function handleDelete(p: Participant) {
    if (!(await confirm({ message: t("participantDetail.confirmDeleteParticipant", { name: p.name }), danger: true }))) return;
    await fetch(`/api/participants/${p.id}/core`, { method: "DELETE" });
    setEditParticipant(null);
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
    setSelected(allVisibleSelected ? new Set() : new Set(filteredParticipants.map((p) => p.id)));
  }

  async function runBulkDelete() {
    if (selected.size === 0) return;
    const ok = await confirm({ message: t("participantsPage.confirmBulkDelete", { count: String(selected.size) }), danger: true });
    if (!ok) return;

    setBulkRunning(true);
    setBulkMessage(null);
    const res = await fetch(`/api/events/${id}/participants/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", participantIds: Array.from(selected) }),
    });
    setBulkRunning(false);
    if (!res.ok) return;
    const data = await res.json();
    setBulkMessage(
      t("participantsPage.bulkResult", {
        succeeded: String(data.succeededCount),
        failed: String(data.failedCount),
      })
    );
    setSelected(new Set());
    load();
  }

  if (loading) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  if (!event) return <div className="p-8 text-[14px] text-ink-secondary">{t("eventDetail.notFound")}</div>;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <a href={`/events/${id}`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("billsPage.back")}
      </a>

      <h1 className="mb-5 mt-2 text-[22px] font-semibold text-ink">
        {event.name} — {t("participantsPage.centralTitle")} ({participants.length})
      </h1>

      {notice && (
        <div
          className={
            "mb-4 flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-[13px] " +
            (notice.warn ? "border-amber-300 bg-amber-50 text-amber-800" : "border-pine/40 bg-pine/10 text-pine")
          }
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 hover:underline">
            {t("common.close")}
          </button>
        </div>
      )}

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
          href={`/events/${id}/participants/import`}
          className="rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2"
        >
          {t("participantsPage.importButton")}
        </a>
        {dynamicListFields.length > 0 && (
          <ColumnPicker
            options={dynamicListFields.map((f) => ({ key: f.key, label: f.label }))}
            shown={activeColumns.map((f) => f.key)}
            labels={{
              button: t("participantsPage.columnsButton"),
              title: t("participantsPage.columnsPickerTitle"),
              dragHint: t("participantsPage.columnsDragHint"),
              notShown: t("participantsPage.columnsNotShown"),
            }}
            onSave={async (keys) => {
              await fetch(`/api/events/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ participantsListColumns: keys }),
              });
              await load();
            }}
          />
        )}
        {moduleAccess.mail && (
          <button
            onClick={() => setStatusModalOpen(true)}
            className="rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2"
          >
            {t("participantsPage.openBulkStatusButton")}
          </button>
        )}
        <button onClick={openAdd} className={btnPrimary}>
          {t("participantsPage.addButton")}
        </button>
      </div>

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-mist bg-paper-2 p-3">
          <span className="text-[14px] font-medium text-ink">
            {t("participantsPage.selectedCount", { count: String(selected.size) })}
          </span>
          <button
            onClick={() =>
              setComposeModal({
                mode: "acceptance",
                participantIds: Array.from(selected),
                alreadyAccepted: participants.filter((p) => selected.has(p.id)).every((p) => p.registrationStatus === "accepted"),
              })
            }
            className="rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2"
          >
            {t("participantsPage.bulkAcceptButton")}
          </button>
          <button
            onClick={() => setComposeModal({ mode: "freeform", participantIds: Array.from(selected) })}
            className="rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2"
          >
            {t("participantsPage.bulkEmailButton")}
          </button>
          <button
            onClick={runBulkDelete}
            disabled={bulkRunning}
            className="rounded-lg border border-red-300 bg-paper px-3 py-1.5 text-[13px] text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {bulkRunning ? t("common.loading") : t("participantsPage.bulkDeleteButton")}
          </button>
        </div>
      )}

      {bulkMessage && <p className="mb-4 text-[13px] text-ink">{bulkMessage}</p>}
      {error && <p className="mb-4 text-[14px] text-red-600">{error}</p>}

      {filteredParticipants.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">
          {searchQuery ? t("participantsPage.searchNoMatches") : t("participantsPage.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-mist text-left">
                <th className="p-2">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} />
                </th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.lastNameLabel")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.firstNameLabel")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.colGroup")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.colAge")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.colRegistration")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.colDocuments")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("participantsPage.contactEmailLabel")}</th>
                {activeColumns.map((f) => (
                  <th key={f.id} className="p-2 text-[12px] font-medium text-ink-secondary">{f.label}</th>
                ))}
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
                    {/* Not split yet (firstName/lastName both null) -- fall back to the whole
                        stored name in the surname cell rather than showing nothing. */}
                    <td className="p-2 text-[14px] text-ink">
                      {moduleAccess.health ? (
                        <a href={`/events/${id}/health/participants/${p.id}`} className="text-ember hover:underline">
                          {p.lastName || (p.firstName ? "—" : p.name)}
                        </a>
                      ) : (
                        p.lastName || (p.firstName ? "—" : p.name)
                      )}
                    </td>
                    <td className="p-2 text-[14px] text-ink">{p.firstName || "—"}</td>
                    <td className="p-2 text-[14px] text-ink-secondary">{p.groupName || "—"}</td>
                    <td className="p-2 text-[14px] text-ink-secondary">{age !== null ? age : "—"}</td>
                    <td className="p-2 text-[13px]">
                      {p.registrationStatus === "accepted" ? (
                        <button
                          onClick={() => setComposeModal({ mode: "acceptance", participantIds: [p.id], alreadyAccepted: true })}
                          title={t("participantsPage.regenerateHint")}
                          className="rounded-full bg-pine/15 px-2 py-0.5 text-pine hover:bg-pine/25"
                        >
                          {t("participantsPage.statusAccepted")}
                        </button>
                      ) : (
                        <button
                          onClick={() => setComposeModal({ mode: "acceptance", participantIds: [p.id] })}
                          className="rounded-full bg-ember/15 px-2 py-0.5 text-ember hover:bg-ember/25"
                        >
                          {t("participantsPage.statusPendingAction")}
                        </button>
                      )}
                    </td>
                    <td className="p-2 text-[13px] text-ink-secondary">
                      {p.documentsTotal > 0 ? `${p.documentsReceived}/${p.documentsTotal}` : "—"}
                    </td>
                    <td className="whitespace-nowrap p-2 text-[13px] text-ink-secondary">{p.computed.contact_email || "—"}</td>
                    {activeColumns.map((f) => (
                      <td key={f.id} className="p-2 text-[14px] text-ink-secondary">
                        {resolveDynamicValue(f, p)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap p-2 text-right">
                      <button onClick={() => startEdit(p)} className="text-[13px] text-ember hover:underline">
                        {t("common.edit")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-paper p-5">
            <h2 className="mb-4 text-[16px] font-semibold text-ink">{t("participantsPage.addButton")}</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div className="flex gap-2">
                <label className="flex-1 text-[13px] text-ink-secondary">
                  {t("participantsPage.firstNameLabel")}
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={inputClass + " mt-1"}
                    autoFocus
                  />
                </label>
                <label className="flex-1 text-[13px] text-ink-secondary">
                  {t("participantsPage.lastNameLabel")}
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={inputClass + " mt-1"}
                  />
                </label>
              </div>
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

              <label className="flex items-center gap-2 text-[13px] text-ink">
                <input type="checkbox" checked={acceptImmediately} onChange={(e) => setAcceptImmediately(e.target.checked)} />
                {t("participantsPage.acceptImmediatelyLabel")}
              </label>

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
                  <input
                    type="tel"
                    placeholder={t("participantDetail.guardianPhoneLabel")}
                    value={g.phone}
                    onChange={(e) => updateGuardian(i, { phone: e.target.value })}
                    className={inputClass + " flex-1"}
                  />
                  {guardians.length > 1 && (
                    <button type="button" onClick={() => removeGuardianRow(i)} className="text-[13px] text-red-600 hover:underline">
                      {t("common.delete")}
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addGuardianRow} className="self-start text-[13px] text-ember hover:underline">
                {t("participantDetail.addGuardianButton")}
              </button>

              {error && <p className="text-[13px] text-red-600">{error}</p>}

              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setAddOpen(false)} className="text-[13px] text-ink-secondary hover:underline">
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

      {editParticipant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-paper p-5">
            <h2 className="mb-4 text-[16px] font-semibold text-ink">{t("common.edit")}</h2>
            <form onSubmit={saveEdit} className="flex flex-col gap-5">
              <div className="flex flex-col gap-3">
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-secondary">
                  {t("participantDetail.sectionBasics")}
                </h3>
                <div className="flex gap-2">
                  <label className="flex-1 text-[13px] text-ink-secondary">
                    {t("participantsPage.firstNameLabel")}
                    <input
                      type="text"
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      className={inputClass + " mt-1"}
                      autoFocus
                    />
                  </label>
                  <label className="flex-1 text-[13px] text-ink-secondary">
                    {t("participantsPage.lastNameLabel")}
                    <input
                      type="text"
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      className={inputClass + " mt-1"}
                    />
                  </label>
                </div>
                <label className="text-[13px] text-ink-secondary">
                  {t("participantsPage.colGroup")}
                  <input
                    type="text"
                    value={editGroup}
                    onChange={(e) => setEditGroup(e.target.value)}
                    className={inputClass + " mt-1"}
                  />
                </label>
                <label className="text-[13px] text-ink-secondary">
                  {t("participantsPage.dobLabel")}
                  <input
                    type="date"
                    value={editDob}
                    onChange={(e) => setEditDob(e.target.value)}
                    className={inputClass + " mt-1"}
                  />
                </label>
              </div>

              <div className="flex flex-col gap-2 border-t border-mist pt-4">
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-secondary">
                  {t("participantDetail.guardiansTitle")}
                </h3>
                {editGuardians.map((g) => (
                  <div key={g.id} className="flex flex-col gap-2 rounded-lg border border-mist p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        placeholder={t("common.name")}
                        value={g.name}
                        onChange={(e) => updateEditGuardianDraft(g.id, { name: e.target.value })}
                        className={inputClass + " flex-1"}
                      />
                      <input
                        type="email"
                        placeholder={t("participantDetail.guardianEmailLabel")}
                        value={g.email}
                        onChange={(e) => updateEditGuardianDraft(g.id, { email: e.target.value })}
                        className={inputClass + " flex-1"}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        placeholder={t("participantDetail.guardianRelationshipLabel")}
                        value={g.relationship}
                        onChange={(e) => updateEditGuardianDraft(g.id, { relationship: e.target.value })}
                        className={inputClass + " flex-1"}
                      />
                      <input
                        type="tel"
                        placeholder={t("participantDetail.guardianPhoneLabel")}
                        value={g.phone}
                        onChange={(e) => updateEditGuardianDraft(g.id, { phone: e.target.value })}
                        className={inputClass + " flex-1"}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-[13px] text-ink">
                        <input
                          type="checkbox"
                          checked={g.receivesCommunications}
                          onChange={(e) => updateEditGuardianDraft(g.id, { receivesCommunications: e.target.checked })}
                        />
                        {t("participantDetail.guardianReceivesLabel")}
                      </label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => saveEditGuardian(g.id)}
                          disabled={savingGuardianId === g.id}
                          className="text-[13px] text-ember hover:underline disabled:opacity-50"
                        >
                          {t("common.save")}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteEditGuardian(g.id)}
                          disabled={savingGuardianId === g.id}
                          className="text-[13px] text-red-600 hover:underline disabled:opacity-50"
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-mist p-2">
                  <input
                    type="text"
                    placeholder={t("common.name")}
                    value={newGuardianDraft.name}
                    onChange={(e) => setNewGuardianDraft((d) => ({ ...d, name: e.target.value }))}
                    className={inputClass + " flex-1"}
                  />
                  <input
                    type="email"
                    placeholder={t("participantDetail.guardianEmailLabel")}
                    value={newGuardianDraft.email}
                    onChange={(e) => setNewGuardianDraft((d) => ({ ...d, email: e.target.value }))}
                    className={inputClass + " flex-1"}
                  />
                  <button
                    type="button"
                    onClick={addEditGuardian}
                    disabled={savingGuardianId === "new" || !newGuardianDraft.email.trim()}
                    className={btnSecondary}
                  >
                    {t("participantDetail.addGuardianButton")}
                  </button>
                </div>
              </div>

              {editableFields.length > 0 && (
                <div className="flex flex-col gap-3 border-t border-mist pt-4">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-secondary">
                    {t("participantDetail.sectionCustomFields")}
                  </h3>
                  {editableFields.map((f) => (
                    <FieldInput
                      key={f.id}
                      field={f}
                      value={editCustomFieldValues[f.key] ?? ""}
                      onChange={(v) => setEditFieldValue(f.key, v)}
                    />
                  ))}
                </div>
              )}

              {editableHealthFields.length > 0 && (
                <div className="flex flex-col gap-3 border-t border-mist pt-4">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-secondary">
                    {t("participantDetail.sectionHealthNotes")}
                  </h3>
                  {editableHealthFields.map((f) => (
                    <FieldInput
                      key={f.id}
                      field={f}
                      value={editCustomFieldValues[f.key] ?? ""}
                      onChange={(v) => setEditFieldValue(f.key, v)}
                      multiline
                    />
                  ))}
                </div>
              )}

              {moduleAccess.health && (
                <a
                  href={`/events/${id}/health/participants/${editParticipant.id}`}
                  className="text-[13px] text-ember hover:underline"
                >
                  {t("participantsPage.editHealthDetailsLink")}
                </a>
              )}

              {error && <p className="text-[13px] text-red-600">{error}</p>}

              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleDelete(editParticipant)}
                  className="text-[13px] text-red-600 hover:underline"
                >
                  {t("common.delete")}
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditParticipant(null)} className="text-[13px] text-ink-secondary hover:underline">
                    {t("common.cancel")}
                  </button>
                  <button type="submit" disabled={savingEdit} className={btnPrimary}>
                    {t("common.save")}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {composeModal && (
        <ComposeEmailModal
          eventId={id}
          participantIds={composeModal.participantIds}
          mode={composeModal.mode}
          alreadyAccepted={composeModal.alreadyAccepted}
          onClose={() => setComposeModal(null)}
          onSent={({ sentCount, failedCount, documentsGenerated, documentFailures, emailSkipped }) => {
            setComposeModal(null);
            setSelected(new Set());
            setNotice({
              warn: failedCount > 0 || documentFailures.length > 0,
              text:
                (emailSkipped
                  ? t("composeEmailModal.docsRegenerated", { count: String(documentsGenerated) })
                  : t("composeEmailModal.sendDone", { sent: String(sentCount), failed: String(failedCount) })) +
                (documentFailures.length > 0
                  ? " " + t("composeEmailModal.docsFailed", { docs: documentFailures.join(", ") })
                  : ""),
            });
            load();
          }}
        />
      )}

      {statusModalOpen && event && (
        <BulkStatusModal eventId={id} eventName={event.name} onClose={() => setStatusModalOpen(false)} />
      )}
    </div>
  );
}

// Renders one admin-defined field by its type. Values are always stored as
// plain strings in Participant.customFieldValues (see
// src/lib/document-variables.ts's participant_custom_field resolver) --
// boolean fields round-trip as the literal strings "true"/"false".
function FieldInput({
  field,
  value,
  onChange,
  multiline,
}: {
  field: ParticipantFieldDef;
  value: string;
  onChange: (value: string) => void;
  // Zdravotní poznámky tend to be longer free text (Part 7: this replaces the Health
  // detail page's separate textarea-based notes editor -- same field, one editor now,
  // so it keeps the textarea instead of regressing to a single-line input).
  multiline?: boolean;
}) {
  if (field.fieldType === "boolean") {
    return (
      <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
        <input type="checkbox" checked={value === "true"} onChange={(e) => onChange(String(e.target.checked))} />
        {field.label}
      </label>
    );
  }
  if (field.fieldType === "select") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">{field.label}</option>
        {(field.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  if (multiline && field.fieldType === "text") {
    return (
      <textarea
        placeholder={field.label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className={inputClass}
      />
    );
  }
  return (
    <input
      type={field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text"}
      placeholder={field.label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  );
}
