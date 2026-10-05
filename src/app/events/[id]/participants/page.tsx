"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { calculateAge } from "@/lib/age";
import { formatFieldValue, type ParticipantFieldDef } from "@/lib/participant-fields";
import { FIXED_PARTICIPANT_FIELDS } from "@/lib/fixed-participant-fields";
import { composeHref, type ComposeRequest } from "@/lib/compose-handoff";
import StatusUpdateButton from "@/components/mail/StatusUpdateButton";
import ColumnPicker from "@/components/ColumnPicker";
import { columnValue } from "@/lib/participant-columns";
import { useConfirm } from "@/components/ConfirmDialog";
import { UploadReviewLink } from "@/components/participants/UploadReview";
import { REGISTRATION_STATES, type RegistrationState } from "@/lib/registration-status";

type EventBasic = { id: string; name: string; participantsListColumns: string[] | null; kind: "event" | "membership"; registrationConnected: boolean };
type ChildOption = { id: string; name: string; firstName: string | null; lastName: string | null; dateOfBirth: string | null };
const childOptionLabel = (c: ChildOption) =>
  `${c.name} (${c.dateOfBirth ? new Date(c.dateOfBirth).toLocaleDateString("cs-CZ", { timeZone: "UTC" }) : "—"})`;

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
  state: RegistrationState;
  customFieldValues: Record<string, string> | null;
  guardian: { name: string | null; email: string; relationship: string | null; phone: string | null } | null;
  computed: { price: number | null; priceSent: number | null; var_symb: string; contact_email: string };
};

// "cena se změnila po odeslání" (slice 3 C): the live price differs from the acceptance e-mail's.
const priceChanged = (p: Participant) => p.computed.priceSent != null && p.computed.price !== p.computed.priceSent;

const resolveDynamicValue = columnValue;

type GuardianDraft = { name: string; email: string; relationship: string; phone: string };

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

function emptyGuardian(): GuardianDraft {
  return { name: "", email: "", relationship: "", phone: "" };
}

export default function EventParticipantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t, role } = useTranslations();
  const confirm = useConfirm();
  const router = useRouter();
  const openCompose = (req: ComposeRequest) => router.push(composeHref(id, req));

  const [event, setEvent] = useState<EventBasic | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  // Status filter (slice 4 #8), same states as the parent portal.
  const [stateFilter, setStateFilter] = useState<RegistrationState | "">("");
  const [moduleAccess, setModuleAccess] = useState<Record<string, boolean>>({});

  const [addOpen, setAddOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [guardians, setGuardians] = useState<GuardianDraft[]>([emptyGuardian()]);
  const [acceptImmediately, setAcceptImmediately] = useState(false);
  // Registration-connected events: admin picks an existing child (src/lib/children.ts) --
  // fills name + birth date and links exactly, instead of relying on name matching.
  const [children, setChildren] = useState<ChildOption[] | null>(null);
  const [childPick, setChildPick] = useState("");
  const [childId, setChildId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active event fields -- the roster's optional columns (editing lives on the detail page).
  const [fields, setFields] = useState<ParticipantFieldDef[]>([]);
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

  const filteredParticipants = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return participants.filter((p) => (!query || p.name.toLowerCase().includes(query)) && (!stateFilter || p.state === stateFilter));
  }, [participants, searchQuery, stateFilter]);

  function openDetail(participantId: string) {
    // The detail page's previous/next walk the list exactly as shown here (search included).
    try {
      sessionStorage.setItem(`participantOrder:${id}`, JSON.stringify(filteredParticipants.map((p) => p.id)));
    } catch {}
    router.push(`/events/${id}/participants/${participantId}`);
  }

  function openAdd() {
    setError(null);
    setFirstName("");
    setLastName("");
    setGroupName("");
    setDateOfBirth("");
    setGuardians([emptyGuardian()]);
    setAcceptImmediately(false);
    setChildPick("");
    setChildId(null);
    if (role === "admin" && (event?.registrationConnected || event?.kind === "membership") && children === null) {
      fetch("/api/children?list=1")
        .then((r) => (r.ok ? r.json() : []))
        .then(setChildren)
        .catch(() => {});
    }
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
        childId: childId ?? undefined,
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

  // Registration status chip -> acceptance dialog (shared by the table and the mobile cards).
  const statusButton = (p: (typeof filteredParticipants)[number]) =>
    p.registrationStatus === "accepted" ? (
      <button
        onClick={(e) => {
          e.stopPropagation();
          openCompose({ mode: "acceptance", participantIds: [p.id], alreadyAccepted: true });
        }}
        title={t("participantsPage.regenerateHint")}
        className="rounded-full bg-pine/15 px-2 py-0.5 text-pine hover:bg-pine/25"
      >
        {t("participantsPage.statusAccepted")}
      </button>
    ) : (
      <button
        onClick={(e) => {
          e.stopPropagation();
          openCompose({ mode: "acceptance", participantIds: [p.id] });
        }}
        className="rounded-full bg-ember/15 px-2 py-0.5 text-ember hover:bg-ember/25"
      >
        {t("participantsPage.statusPendingAction")}
      </button>
    );

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
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as RegistrationState | "")}
          aria-label={t("participantsPage.stateFilter")}
          className="rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-[13px] text-ink"
        >
          <option value="">
            {t("portal.state.all")} ({participants.length})
          </option>
          {REGISTRATION_STATES.map((st) => (
            <option key={st} value={st}>
              {t(`portal.state.${st}`)} ({participants.filter((p) => p.state === st).length})
            </option>
          ))}
        </select>
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
        <button
          onClick={() =>
            openCompose({ mode: "freeform", participantIds: selected.size > 0 ? Array.from(selected) : filteredParticipants.map((p) => p.id) })
          }
          disabled={filteredParticipants.length === 0}
          title={t("participantsPage.writeEmailHint")}
          className="rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2 disabled:opacity-50"
        >
          {t("participantsPage.writeEmailButton")}
        </button>
        {moduleAccess.mail && <StatusUpdateButton eventId={id} />}
        <UploadReviewLink eventId={id} />
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
              openCompose({
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
            onClick={() => openCompose({ mode: "freeform", participantIds: Array.from(selected) })}
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
          {searchQuery || stateFilter ? t("participantsPage.searchNoMatches") : t("participantsPage.empty")}
        </p>
      ) : (
        <>
        <div className="hidden overflow-x-auto md:block">
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
                  // The whole row opens the participant; the checkbox and status chip don't.
                  <tr key={p.id} onClick={() => openDetail(p.id)} className="cursor-pointer border-b border-mist/60 hover:bg-paper-2">
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                    </td>
                    {/* Not split yet (firstName/lastName both null) -- fall back to the whole
                        stored name in the surname cell rather than showing nothing. */}
                    <td className="p-2 text-[14px] font-medium text-ink">{p.lastName || (p.firstName ? "—" : p.name)}</td>
                    <td className="p-2 text-[14px] text-ink">{p.firstName || "—"}</td>
                    <td className="p-2 text-[14px] text-ink-secondary">{p.groupName || "—"}</td>
                    <td className="p-2 text-[14px] text-ink-secondary">{age !== null ? age : "—"}</td>
                    <td className="p-2 text-[13px]">
                      {statusButton(p)}
                      {priceChanged(p) && (
                        <span className="ml-1 block whitespace-nowrap text-[11.5px] text-amber-700">
                          {t("priceRules.changedAfterSend", { old: String(p.computed.priceSent), new: String(p.computed.price ?? "—") })}
                        </span>
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
                    <td className="whitespace-nowrap p-2 text-right text-ink-secondary">›</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile: cards (same pattern as the bills list) */}
        <div className="flex flex-col gap-2 md:hidden">
          <label className="flex items-center gap-2 px-1 text-[13px] text-ink-secondary">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} />
            {t("participantsPage.selectAll")}
          </label>
          {filteredParticipants.map((p) => {
            const age = calculateAge(p.dateOfBirth);
            const fullName = [p.lastName, p.firstName].filter(Boolean).join(" ") || p.name;
            return (
              <div key={p.id} onClick={() => openDetail(p.id)} className="cursor-pointer rounded-lg border border-mist bg-paper-2 p-3">
                <div className="mb-1.5 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleSelect(p.id)}
                      className="mt-1 shrink-0"
                    />
                    <span className="text-[14px] font-medium text-ink">{fullName}</span>
                  </div>
                  <span className="shrink-0 text-[12px]">{statusButton(p)}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-secondary">
                  {priceChanged(p) && <span className="text-amber-700">{t("priceRules.changedAfterSend", { old: String(p.computed.priceSent), new: String(p.computed.price ?? "—") })}</span>}
                  {p.groupName && <span>{p.groupName}</span>}
                  {age !== null && <span>{t("participantsPage.colAge")}: {age}</span>}
                  {p.documentsTotal > 0 && (
                    <span>
                      {t("participantsPage.colDocuments")}: {p.documentsReceived}/{p.documentsTotal}
                    </span>
                  )}
                  {p.computed.contact_email && <span className="break-all">{p.computed.contact_email}</span>}
                </div>
                {activeColumns.length > 0 && (
                  <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[12px]">
                    {activeColumns.map((f) => (
                      <div key={f.id} className="contents">
                        <dt className="text-ink-secondary">{f.label}</dt>
                        <dd className="min-w-0 break-words text-ink">{resolveDynamicValue(f, p) || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            );
          })}
        </div>
        </>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-paper p-5">
            <h2 className="mb-4 text-[16px] font-semibold text-ink">{t("participantsPage.addButton")}</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              {children && children.length > 0 && (
                <label className="text-[13px] text-ink-secondary">
                  {t("participantsPage.pickChild")}
                  <input
                    list="add-children-list"
                    value={childPick}
                    onChange={(e) => {
                      setChildPick(e.target.value);
                      const c = children.find((o) => childOptionLabel(o) === e.target.value);
                      setChildId(c?.id ?? null);
                      if (c) {
                        setFirstName(c.firstName ?? c.name);
                        setLastName(c.lastName ?? "");
                        setDateOfBirth(c.dateOfBirth ? c.dateOfBirth.slice(0, 10) : "");
                      }
                    }}
                    className={inputClass + " mt-1"}
                  />
                  <datalist id="add-children-list">
                    {children.map((c) => (
                      <option key={c.id} value={childOptionLabel(c)} />
                    ))}
                  </datalist>
                  <span className="mt-1 block text-[11.5px]">{childId ? t("participantsPage.pickChildLinked") : t("participantsPage.pickChildHint")}</span>
                </label>
              )}
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


    </div>
  );
}
