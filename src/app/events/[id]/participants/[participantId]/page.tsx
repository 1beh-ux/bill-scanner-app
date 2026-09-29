"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { fieldCategory, type ParticipantFieldDef } from "@/lib/participant-fields";
import { composeHref } from "@/lib/compose-handoff";
import { useConfirm } from "@/components/ConfirmDialog";
import StatusUpdateButton from "@/components/mail/StatusUpdateButton";

// Participant detail/edit (Seznam účastníků -> row). Was a modal on the list;
// basics + guardians on the left, the event's own fields on the right.
type GuardianDraft = { name: string; email: string; relationship: string; phone: string };
type EditGuardian = GuardianDraft & { id: string; receivesCommunications: boolean };
type DocStatus = { docTypeId: string; name: string; received: boolean; receivedAt: string | null; receivedVia: string | null; driveUrl: string | null };
type Core = {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  groupName: string | null;
  dateOfBirth: string | null;
  registrationStatus: "pending" | "accepted";
  customFieldValues: Record<string, string>;
  guardians: { id: string; name: string | null; email: string; relationship: string | null; phone: string | null; receivesCommunications: boolean }[];
};

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const btnSecondary = "rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";
const sectionTitle = "text-[13px] font-semibold uppercase tracking-wide text-ink-secondary";
const emptyGuardian = (): GuardianDraft => ({ name: "", email: "", relationship: "", phone: "" });

export default function ParticipantDetailPage({ params }: { params: Promise<{ id: string; participantId: string }> }) {
  const { id: eventId, participantId } = use(params);
  const { t } = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();

  const [core, setCore] = useState<Core | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [fields, setFields] = useState<ParticipantFieldDef[]>([]);
  const [moduleAccess, setModuleAccess] = useState<Record<string, boolean>>({});
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [group, setGroup] = useState("");
  const [dob, setDob] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [guardians, setGuardians] = useState<EditGuardian[]>([]);
  const [newGuardian, setNewGuardian] = useState<GuardianDraft>(emptyGuardian());
  const [savingGuardianId, setSavingGuardianId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocStatus[]>([]);
  const [togglingDoc, setTogglingDoc] = useState<string | null>(null);

  const loadDocs = () =>
    fetch(`/api/participants/${participantId}/documents?byType=1`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setDocs)
      .catch(() => {});

  // Received <-> missing by hand (same toggle as the Documents overview).
  async function toggleDoc(d: DocStatus) {
    setTogglingDoc(d.docTypeId);
    await fetch(`/api/events/${eventId}/participants/${participantId}/documents/${d.docTypeId}`, { method: d.received ? "DELETE" : "POST" });
    setTogglingDoc(null);
    loadDocs();
  }

  useEffect(() => {
    fetch(`/api/participants/${participantId}/core`)
      .then(async (r) => {
        if (!r.ok) return setNotFound(true);
        const p: Core = await r.json();
        setCore(p);
        // Not split yet -- the whole stored name goes in Příjmení rather than being lost.
        setFirstName(p.firstName ?? "");
        setLastName(p.lastName ?? (p.firstName ? "" : p.name));
        setGroup(p.groupName ?? "");
        setDob(p.dateOfBirth ? p.dateOfBirth.slice(0, 10) : "");
        setValues({ ...(p.customFieldValues ?? {}) });
        setGuardians(
          p.guardians.map((g) => ({
            id: g.id,
            name: g.name ?? "",
            email: g.email,
            relationship: g.relationship ?? "",
            phone: g.phone ?? "",
            receivesCommunications: g.receivesCommunications,
          }))
        );
      })
      .catch(() => setNotFound(true));
    loadDocs();
    fetch(`/api/events/${eventId}/participant-fields`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setFields)
      .catch(() => {});
    fetch(`/api/events/${eventId}/modules/mine`)
      .then((r) => (r.ok ? r.json() : {}))
      .then(setModuleAccess)
      .catch(() => {});
  }, [eventId, participantId]);

  // "Údaje" vs "Zdravotní poznámky" (health-category custom fields).
  const otherFields = useMemo(() => fields.filter((f) => f.kind === "custom" && fieldCategory(f.kind, f.surfaces) !== "health"), [fields]);
  const healthFields = useMemo(() => fields.filter((f) => f.kind === "custom" && fieldCategory(f.kind, f.surfaces) === "health"), [fields]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() && !lastName.trim()) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    const res = await fetch(`/api/participants/${participantId}/core`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        groupName: group.trim() || null,
        dateOfBirth: dob || null,
        customFieldValues: values,
      }),
    });
    setSaving(false);
    if (!res.ok) return setError(t("participantDetail.errorSaveFailed"));
    setSaved(true);
  }

  async function remove() {
    if (!core) return;
    if (!(await confirm({ message: t("participantDetail.confirmDeleteParticipant", { name: core.name }), danger: true }))) return;
    await fetch(`/api/participants/${participantId}/core`, { method: "DELETE" });
    router.push(`/events/${eventId}/participants`);
  }

  const patchGuardian = (gid: string, patch: Partial<EditGuardian>) => setGuardians((prev) => prev.map((g) => (g.id === gid ? { ...g, ...patch } : g)));

  async function saveGuardian(gid: string) {
    const g = guardians.find((x) => x.id === gid);
    if (!g) return;
    setSavingGuardianId(gid);
    await fetch(`/api/participants/${participantId}/guardians/${gid}`, {
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
  }

  async function deleteGuardian(gid: string) {
    if (!(await confirm({ message: t("participantDetail.confirmDeleteGuardian"), danger: true }))) return;
    setSavingGuardianId(gid);
    await fetch(`/api/participants/${participantId}/guardians/${gid}`, { method: "DELETE" });
    setSavingGuardianId(null);
    setGuardians((prev) => prev.filter((g) => g.id !== gid));
  }

  async function addGuardian() {
    if (!newGuardian.email.trim()) return;
    setSavingGuardianId("new");
    const res = await fetch(`/api/participants/${participantId}/guardians`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newGuardian.name.trim() || undefined,
        email: newGuardian.email.trim(),
        relationship: newGuardian.relationship.trim() || undefined,
        phone: newGuardian.phone.trim() || undefined,
      }),
    });
    setSavingGuardianId(null);
    if (!res.ok) return;
    const c = await res.json();
    setGuardians((prev) => [
      ...prev,
      { id: c.id, name: c.name ?? "", email: c.email, relationship: c.relationship ?? "", phone: c.phone ?? "", receivesCommunications: c.receivesCommunications },
    ]);
    setNewGuardian(emptyGuardian());
  }

  const back = (
    <Link href={`/events/${eventId}/participants`} className="text-[13px] text-ink-secondary hover:text-ink">
      ← {t("participantsPage.centralTitle")}
    </Link>
  );
  if (notFound) return <div className="mx-auto max-w-5xl p-4 md:p-8">{back}<p className="mt-4 text-[14px] text-ink-secondary">{t("participantDetail.notFound")}</p></div>;
  if (!core) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;

  const accepted = core.registrationStatus === "accepted";

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      {back}
      <div className="mb-5 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold text-ink">{[firstName, lastName].filter(Boolean).join(" ") || core.name}</h1>
        <Link
          href={composeHref(eventId, { mode: "acceptance", participantIds: [participantId], alreadyAccepted: accepted })}
          title={accepted ? t("participantsPage.regenerateHint") : undefined}
          className={"rounded-full px-2.5 py-0.5 text-[13px] " + (accepted ? "bg-pine/15 text-pine hover:bg-pine/25" : "bg-ember/15 text-ember hover:bg-ember/25")}
        >
          {accepted ? t("participantsPage.statusAccepted") : t("participantsPage.statusPendingAction")}
        </Link>
        <Link href={composeHref(eventId, { mode: "freeform", participantIds: [participantId] })} className={btnSecondary}>
          {t("participantsPage.bulkEmailButton")}
        </Link>
        {moduleAccess.mail && <StatusUpdateButton eventId={eventId} participantId={participantId} className={btnSecondary} />}
        {moduleAccess.health && (
          <Link href={`/events/${eventId}/health/participants/${participantId}`} className="text-[13px] text-ember hover:underline">
            {t("participantsPage.editHealthDetailsLink")}
          </Link>
        )}
      </div>

      <form onSubmit={save} className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-3">
              <h2 className={sectionTitle}>{t("participantDetail.sectionBasics")}</h2>
              <div className="flex gap-2">
                <label className="flex-1 text-[13px] text-ink-secondary">
                  {t("participantsPage.firstNameLabel")}
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass + " mt-1"} />
                </label>
                <label className="flex-1 text-[13px] text-ink-secondary">
                  {t("participantsPage.lastNameLabel")}
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass + " mt-1"} />
                </label>
              </div>
              <div className="flex gap-2">
                <label className="flex-1 text-[13px] text-ink-secondary">
                  {t("participantsPage.colGroup")}
                  <input value={group} onChange={(e) => setGroup(e.target.value)} className={inputClass + " mt-1"} />
                </label>
                <label className="flex-1 text-[13px] text-ink-secondary">
                  {t("participantsPage.dobLabel")}
                  <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={inputClass + " mt-1"} />
                </label>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className={sectionTitle}>{t("participantDetail.guardiansTitle")}</h2>
              {guardians.map((g) => (
                <div key={g.id} className="flex flex-col gap-2 rounded-lg border border-mist p-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input placeholder={t("common.name")} value={g.name} onChange={(e) => patchGuardian(g.id, { name: e.target.value })} className={inputClass} />
                    <input type="email" placeholder={t("participantDetail.guardianEmailLabel")} value={g.email} onChange={(e) => patchGuardian(g.id, { email: e.target.value })} className={inputClass} />
                    <input placeholder={t("participantDetail.guardianRelationshipLabel")} value={g.relationship} onChange={(e) => patchGuardian(g.id, { relationship: e.target.value })} className={inputClass} />
                    <input type="tel" placeholder={t("participantDetail.guardianPhoneLabel")} value={g.phone} onChange={(e) => patchGuardian(g.id, { phone: e.target.value })} className={inputClass} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-[13px] text-ink">
                      <input type="checkbox" checked={g.receivesCommunications} onChange={(e) => patchGuardian(g.id, { receivesCommunications: e.target.checked })} />
                      {t("participantDetail.guardianReceivesLabel")}
                    </label>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => saveGuardian(g.id)} disabled={savingGuardianId === g.id} className="text-[13px] text-ember hover:underline disabled:opacity-50">
                        {t("common.save")}
                      </button>
                      <button type="button" onClick={() => deleteGuardian(g.id)} disabled={savingGuardianId === g.id} className="text-[13px] text-red-600 hover:underline disabled:opacity-50">
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <div className="grid gap-2 rounded-lg border border-dashed border-mist p-2 sm:grid-cols-[1fr_1fr_auto]">
                <input placeholder={t("common.name")} value={newGuardian.name} onChange={(e) => setNewGuardian((d) => ({ ...d, name: e.target.value }))} className={inputClass} />
                <input type="email" placeholder={t("participantDetail.guardianEmailLabel")} value={newGuardian.email} onChange={(e) => setNewGuardian((d) => ({ ...d, email: e.target.value }))} className={inputClass} />
                <button type="button" onClick={addGuardian} disabled={savingGuardianId === "new" || !newGuardian.email.trim()} className={btnSecondary}>
                  {t("participantDetail.addGuardianButton")}
                </button>
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-5">
            {docs.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className={sectionTitle}>{t("participantsPage.colDocuments")}</h2>
                <ul className="flex flex-col gap-1.5">
                  {docs.map((d) => (
                    <li key={d.docTypeId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-mist px-3 py-2 text-[14px]">
                      <span className="text-ink">{d.name}</span>
                      <span className="flex items-center gap-2 text-[12px] text-ink-secondary">
                        {d.received && d.receivedAt && (
                          <span>
                            {new Date(d.receivedAt).toLocaleDateString("cs-CZ")}
                            {d.receivedVia && ` · ${t(`participantDetail.documentsVia.${d.receivedVia}`)}`}
                          </span>
                        )}
                        {d.driveUrl && (
                          <a href={d.driveUrl} target="_blank" rel="noreferrer" className="text-ember hover:underline">
                            Drive ↗
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleDoc(d)}
                          disabled={togglingDoc === d.docTypeId}
                          title={t("participantsPage.toggleDocumentHint")}
                          className={
                            "rounded-full px-2 py-0.5 disabled:opacity-50 " +
                            (d.received ? "bg-pine/15 text-pine hover:bg-pine/25" : "bg-mist text-ink-secondary hover:bg-paper")
                          }
                        >
                          {d.received ? t("participantsPage.docReceived") : t("participantsPage.docMissing")}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {otherFields.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className={sectionTitle}>{t("participantDetail.sectionCustomFields")}</h2>
                {otherFields.map((f) => (
                  <FieldInput key={f.id} field={f} value={values[f.key] ?? ""} onChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))} />
                ))}
              </section>
            )}
            {healthFields.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className={sectionTitle}>{t("participantDetail.sectionHealthNotes")}</h2>
                {healthFields.map((f) => (
                  <FieldInput key={f.id} field={f} value={values[f.key] ?? ""} onChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))} multiline />
                ))}
              </section>
            )}
          </div>
        </div>

        {error && <p className="text-[13px] text-red-600">{error}</p>}
        <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-2 border-t border-mist bg-paper px-4 py-3 md:mx-0 md:px-0">
          <button type="button" onClick={remove} className="text-[13px] text-red-600 hover:underline">
            {t("common.delete")}
          </button>
          <div className="flex items-center gap-3">
            {saved && <span className="text-[13px] text-pine">{t("settingsPage.saved")}</span>}
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// One admin-defined field by its type; values are plain strings ("true"/"false" for booleans).
function FieldInput({ field, value, onChange, multiline }: { field: ParticipantFieldDef; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  if (field.fieldType === "boolean") {
    return (
      <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
        <input type="checkbox" checked={value === "true"} onChange={(e) => onChange(String(e.target.checked))} />
        {field.label}
      </label>
    );
  }
  const label = (control: React.ReactNode) => (
    <label className="text-[13px] text-ink-secondary">
      {field.label}
      <div className="mt-1">{control}</div>
    </label>
  );
  if (field.fieldType === "select") {
    return label(
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">—</option>
        {(field.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  if (multiline && field.fieldType === "text") {
    return label(<textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={inputClass} />);
  }
  return label(
    <input
      type={field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  );
}
