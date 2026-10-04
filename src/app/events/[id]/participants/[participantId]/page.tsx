"use client";

import { use, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { toBoolean, type ParticipantFieldDef } from "@/lib/participant-fields";
import { composeHref } from "@/lib/compose-handoff";
import { useConfirm } from "@/components/ConfirmDialog";
import StatusUpdateButton from "@/components/mail/StatusUpdateButton";
import AutoTextarea from "@/components/participants/AutoTextarea";
import { useCollapsed } from "@/lib/use-collapsed";
import type { HealthNoteConfig } from "@/lib/health-notes";
import {
  FIXED_KINDS,
  detailFieldOrder,
  healthConfigForDetail,
  moveField,
  moveSection,
  readParticipantLayout,
  resolveDetailLayout,
  type Column,
  type PageLayout,
  type Section,
} from "@/lib/participant-layout";
import { AddFieldSelect, DropZone, FieldRow, Inert, LayoutEditorBar, SectionCard, type LayoutDrag } from "@/components/participants/LayoutEditor";

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
  // Membership confirmed by the membership event (registration-connected events).
  confirmedMembership: { key: string; year: number } | null;
  portalNote: string | null;
  // Price rules (slice 3 C) -- null when the event has none.
  pricing: { category: string | null; categories: { key: string; label: string }[]; price: number | null; priceSent: number | null } | null;
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
  const [adjacent, setAdjacent] = useState<{ prev: string | null; next: string | null }>({ prev: null, next: null });
  const [baseline, setBaseline] = useState<string | null>(null);
  const [togglingDoc, setTogglingDoc] = useState<string | null>(null);
  // Layout ("Upravit rozvržení"): saved = Event.participantLayout.detail; draft != null = editing.
  const [savedLayout, setSavedLayout] = useState<PageLayout | null>(null);
  const [healthConfig, setHealthConfig] = useState<HealthNoteConfig[]>([]);
  const [draft, setDraft] = useState<PageLayout | null>(null);
  const [drag, setDrag] = useState<LayoutDrag>(null);
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [layoutSaved, setLayoutSaved] = useState(false);
  const [collapsed, toggleCollapsed] = useCollapsed(`layoutCollapsed:${eventId}:detail`);

  const loadLayout = () =>
    fetch(`/api/events/${eventId}/participant-layout`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { layout: unknown; fields: ParticipantFieldDef[]; healthConfig: HealthNoteConfig[] } | null) => {
        if (!d) return;
        setFields(d.fields);
        setSavedLayout(readParticipantLayout(d.layout).detail ?? null);
        setHealthConfig(d.healthConfig);
      })
      .catch(() => {});

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
        setBaseline(
          JSON.stringify({
            firstName: p.firstName ?? "",
            lastName: p.lastName ?? (p.firstName ? "" : p.name),
            group: p.groupName ?? "",
            dob: p.dateOfBirth ? p.dateOfBirth.slice(0, 10) : "",
            values: { ...(p.customFieldValues ?? {}) },
          })
        );
        setSaved(false);
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
    loadLayout();
    fetch(`/api/events/${eventId}/modules/mine`)
      .then((r) => (r.ok ? r.json() : {}))
      .then(setModuleAccess)
      .catch(() => {});
  }, [eventId, participantId]);

  // Previous/next = the participant list's order as last shown (see openDetail there),
  // or the list's default order when this page was opened directly.
  useEffect(() => {
    const place = (ids: string[]) => {
      const i = ids.indexOf(participantId);
      setAdjacent({ prev: i > 0 ? ids[i - 1] : null, next: i >= 0 && i < ids.length - 1 ? ids[i + 1] : null });
    };
    let stored: string[] = [];
    try {
      stored = JSON.parse(sessionStorage.getItem(`participantOrder:${eventId}`) ?? "[]");
    } catch {}
    if (Array.isArray(stored) && stored.includes(participantId)) return place(stored);
    fetch(`/api/events/${eventId}/participants`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { id: string }[]) => place(rows.map((r) => r.id)))
      .catch(() => {});
  }, [eventId, participantId]);

  const isDirty = baseline !== null && JSON.stringify({ firstName, lastName, group, dob, values }) !== baseline;

  async function leave(href: string) {
    if (isDirty && !(await confirm({ message: t("billModal.unsavedConfirm"), confirmLabel: t("billModal.leaveWithoutSaving"), danger: true }))) return;
    router.push(href);
  }
  const detailHref = (pid: string) => `/events/${eventId}/participants/${pid}`;
  const listHref = `/events/${eventId}/participants`;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || draft) return;
      if (e.key === "ArrowLeft" && adjacent.prev) leave(detailHref(adjacent.prev));
      if (e.key === "ArrowRight" && adjacent.next) leave(detailHref(adjacent.next));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjacent, isDirty, draft]);

  // Sections and the custom fields in them ("Údaje", own sections, "Zdravotní
  // poznámky" = the health-notes fields); the built-in layout when never saved.
  const layout = useMemo(() => resolveDetailLayout(savedLayout, fields, healthConfig), [savedLayout, fields, healthConfig]);
  const fieldByKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const view = draft ?? layout;
  const edit = (fn: (l: PageLayout) => PageLayout) => setDraft((d) => d && fn(d));
  const labelOf = (key: string) => fieldByKey.get(key)?.label ?? key;

  async function saveLayout() {
    if (!draft) return;
    const members = (l: PageLayout) => l.sections.find((s) => s.kind === "health")?.fields ?? [];
    const nextHealth = healthConfigForDetail(healthConfig, members(layout), members(draft));
    setLayoutSaving(true);
    setLayoutError(null);
    const res = await fetch(`/api/events/${eventId}/participant-layout`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: "detail", layout: draft, fieldOrder: detailFieldOrder(draft), ...(nextHealth ? { healthConfig: nextHealth } : {}) }),
    });
    setLayoutSaving(false);
    if (!res.ok) return setLayoutError(t("layoutEditor.saveFailed"));
    setSavedLayout(draft);
    setDraft(null);
    setLayoutSaved(true);
    loadLayout();
  }


  function dropOnSection(target: Section) {
    if (drag?.type === "section") edit((l) => moveSection(l, drag.id, target.id, target.column));
    if (drag?.type === "field" && target.fields) edit((l) => moveField(l, drag.key, target.id));
    setDrag(null);
  }
  function dropOnField(target: Section, beforeKey: string) {
    if (drag?.type === "field") {
      edit((l) => moveField(l, drag.key, target.id, beforeKey));
      setDrag(null);
    } else dropOnSection(target);
  }
  function dropOnColumn(column: Column) {
    if (drag?.type === "section") edit((l) => moveSection(l, drag.id, null, column));
    setDrag(null);
  }
  const addSection = (column: Column) =>
    edit((l) => ({ ...l, sections: [...l.sections, { id: `s${Date.now().toString(36)}`, kind: "fields", column, title: t("layoutEditor.newSectionTitle"), fields: [] }] }));
  // A removed section's fields become hidden (addable again).
  const removeSection = (id: string) =>
    edit((l) => ({
      ...l,
      sections: l.sections.filter((s) => s.id !== id),
      hiddenFields: [...(l.hiddenFields ?? []), ...(l.sections.find((s) => s.id === id)?.fields ?? [])],
    }));
  const patchSection = (id: string, patch: Partial<Section>) => edit((l) => ({ ...l, sections: l.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  // then: where to go after a successful save (stay = undefined).
  async function save(e: React.FormEvent | null, then?: "next" | "close") {
    e?.preventDefault();
    if (draft || (!firstName.trim() && !lastName.trim())) return;
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
    setBaseline(JSON.stringify({ firstName, lastName, group, dob, values }));
    setSaved(true);
    if (then === "close") router.push(listHref);
    else if (then === "next" && adjacent.next) router.push(detailHref(adjacent.next));
  }

  async function remove() {
    if (!core) return;
    if (!(await confirm({ message: t("participantDetail.confirmDeleteParticipant", { name: core.name }), danger: true }))) return;
    const res = await fetch(`/api/participants/${participantId}/core`, { method: "DELETE" });
    if (!res.ok) return setError(t("participantDetail.errorDeleteFailed"));
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
    <button type="button" onClick={() => leave(listHref)} className="text-[13px] text-ink-secondary hover:text-ink">
      ← {t("participantsPage.centralTitle")}
    </button>
  );
  const arrow = "rounded-lg border border-mist p-1.5 text-ink-secondary hover:bg-paper-2 disabled:opacity-40 disabled:hover:bg-transparent";
  if (notFound) return <div className="mx-auto max-w-5xl p-4 md:p-8">{back}<p className="mt-4 text-[14px] text-ink-secondary">{t("participantDetail.notFound")}</p></div>;
  if (!core) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;

  const accepted = core.registrationStatus === "accepted";

  // Section contents (shared by the page and, inert, by the layout editor).
  const basicsBody = (
    <>
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
    </>
  );
  const guardiansBody = (
    <>
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
    </>
  );
  const documentsBody = (
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
  );
  const titleOf = (s: Section) =>
    s.kind === "basics"
      ? t("participantDetail.sectionBasics")
      : s.kind === "guardians"
        ? t("participantDetail.guardiansTitle")
        : s.kind === "documents"
          ? t("participantsPage.colDocuments")
          : s.kind === "health"
            ? t("participantDetail.sectionHealthNotes")
            : s.title || t("participantDetail.sectionCustomFields");
  const bodyOf = (s: Section) =>
    s.kind === "basics" ? basicsBody : s.kind === "guardians" ? guardiansBody : s.kind === "documents" ? (docs.length ? documentsBody : <p className="text-[13px] text-ink-secondary">{t("participantDetail.documentsEmpty")}</p>) : null;

  function renderSection(s: Section) {
    if (s.hidden || (s.kind === "documents" && !docs.length)) return null;
    const keys = (s.fields ?? []).filter((k) => fieldByKey.has(k));
    if ((s.kind === "fields" || s.kind === "health") && !keys.length) return null;
    // Variable sections fold (remembered per browser); basics/guardians/documents don't.
    const foldable = s.kind === "fields" || s.kind === "health";
    const folded = foldable && collapsed.has(s.id);
    return (
      <section key={s.id} className={"flex flex-col " + (s.kind === "guardians" || s.kind === "documents" ? "gap-2" : "gap-3")}>
        {foldable ? (
          <button type="button" onClick={() => toggleCollapsed(s.id)} aria-expanded={!folded} className={sectionTitle + " flex items-center gap-1 text-left hover:text-ink"}>
            <ChevronRight size={14} className={"transition-transform " + (folded ? "" : "rotate-90")} aria-hidden="true" />
            {titleOf(s)}
          </button>
        ) : (
          <h2 className={sectionTitle}>{titleOf(s)}</h2>
        )}
        {folded ? null : bodyOf(s)}
        {!folded &&
          keys.map((k) => {
            const f = fieldByKey.get(k)!;
            if (core?.confirmedMembership?.key === f.key) {
              // Shown, not edited: the stored manual value stays untouched underneath.
              return (
                <p key={f.id} className="text-[13px] text-ink-secondary">
                  {f.label}: <span className="text-ink">{t("membershipField.yes")}</span>{" "}
                  <span className="rounded bg-pine-bg px-1.5 py-0.5 text-[12px] text-pine">
                    {t("membershipField.confirmedHint", { year: String(core.confirmedMembership.year) })}
                  </span>
                </p>
              );
            }
            return <FieldInput key={f.id} field={f} value={values[f.key] ?? ""} onChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))} />;
          })}
      </section>
    );
  }

  function renderEditCard(s: Section) {
    const other: Column = s.column === "left" ? "right" : "left";
    return (
      <SectionCard
        key={s.id}
        title={s.kind === "fields" ? (s.title ?? "") : titleOf(s)}
        onTitleChange={s.kind === "fields" ? (v) => patchSection(s.id, { title: v }) : undefined}
        titlePlaceholder={t("participantDetail.sectionCustomFields")}
        hidden={s.hidden}
        onToggleHidden={FIXED_KINDS.includes(s.kind) ? undefined : () => patchSection(s.id, { hidden: !s.hidden })}
        onMove={{ dir: other, run: () => edit((l) => moveSection(l, s.id, null, other)) }}
        onRemove={s.kind === "fields" ? () => removeSection(s.id) : undefined}
        onDragStart={() => setDrag({ type: "section", id: s.id })}
        onDrop={() => dropOnSection(s)}
        dragging={drag?.type === "section" && drag.id === s.id}
      >
        {s.fields ? (
          <>
            {bodyOf(s) && <Inert>{bodyOf(s)}</Inert>}
            {s.fields.map((k) => (
              <FieldRow
                key={k}
                label={labelOf(k)}
                onHide={() => edit((l) => moveField(l, k, null))}
                onDragStart={() => setDrag({ type: "field", key: k })}
                onDrop={() => dropOnField(s, k)}
                dragging={drag?.type === "field" && drag.key === k}
              />
            ))}
            {!s.fields.length && <p className="text-[12px] text-ink-secondary">{t("layoutEditor.emptySection")}</p>}
            <AddFieldSelect options={(view.hiddenFields ?? []).map((k) => ({ key: k, label: labelOf(k) }))} onAdd={(k) => edit((l) => moveField(l, k, s.id))} />
          </>
        ) : (
          <Inert>{bodyOf(s)}</Inert>
        )}
      </SectionCard>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="flex items-center justify-between gap-2">
        {back}
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => adjacent.prev && leave(detailHref(adjacent.prev))} disabled={!adjacent.prev} title={t("participantDetail.prev")} aria-label={t("participantDetail.prev")} className={arrow}>
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => adjacent.next && leave(detailHref(adjacent.next))} disabled={!adjacent.next} title={t("participantDetail.next")} aria-label={t("participantDetail.next")} className={arrow}>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
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
        {!draft && (
          <span className="ml-auto flex items-center gap-2">
            {layoutSaved && <span className="text-[13px] text-pine">{t("layoutEditor.saved")}</span>}
            <button
              type="button"
              onClick={() => {
                setLayoutSaved(false);
                setLayoutError(null);
                setDraft(layout);
              }}
              className={btnSecondary}
            >
              {t("layoutEditor.edit")}
            </button>
          </span>
        )}
      </div>

      {core.pricing && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[13px] text-ink">
          <span className="font-medium">{t("priceRules.category")}:</span>
          <select
            value={core.pricing.category ?? ""}
            onChange={async (e) => {
              const res = await fetch(`/api/participants/${participantId}/core`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ priceCategory: e.target.value || null }) });
              // Only the price block refreshes -- the form's unsaved edits stay.
              const fresh = res.ok ? await fetch(`/api/participants/${participantId}/core`).then((r) => (r.ok ? r.json() : null)) : null;
              if (fresh) setCore((c) => c && { ...c, pricing: fresh.pricing });
            }}
            className="rounded-lg border border-mist bg-paper px-2 py-1 text-[13px] text-ink"
          >
            <option value="">{t("priceRules.categoryDefault")}</option>
            {core.pricing.categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <span>{core.pricing.price != null ? `${core.pricing.price} Kč` : "—"}</span>
          {core.pricing.priceSent != null && core.pricing.priceSent !== core.pricing.price && (
            <span className="text-amber-700">{t("priceRules.changedAfterSend", { old: String(core.pricing.priceSent), new: String(core.pricing.price ?? "—") })}</span>
          )}
        </div>
      )}

      {core.portalNote && (
        <p className="mb-5 whitespace-pre-wrap rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[13px] text-ink">
          <span className="font-medium">{t("childProfile.portalNote")}:</span> {core.portalNote}
        </p>
      )}

      <form onSubmit={save} className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {(["left", "right"] as const).map((column) => (
            <div key={column} className="flex flex-col gap-5">
              {view.sections.filter((s) => s.column === column).map((s) => (draft ? renderEditCard(s) : renderSection(s)))}
              {draft && (
                <DropZone onDrop={() => dropOnColumn(column)}>
                  <button type="button" onClick={() => addSection(column)} className="text-[13px] text-ember hover:underline">
                    + {t("layoutEditor.newSection")}
                  </button>
                </DropZone>
              )}
            </div>
          ))}
        </div>

        {error && <p className="text-[13px] text-red-600">{error}</p>}
        {draft ? (
          <LayoutEditorBar saving={layoutSaving} error={layoutError} onCancel={() => setDraft(null)} onSave={saveLayout} />
        ) : (
          <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-2 border-t border-mist bg-paper px-4 py-3 md:mx-0 md:px-0">
            <button type="button" onClick={remove} className="text-[13px] text-red-600 hover:underline">
              {t("common.delete")}
            </button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {saved && !isDirty && <span className="text-[13px] text-pine">{t("settingsPage.saved")}</span>}
              <button type="submit" disabled={saving} className={btnSecondary + " px-4 py-2 text-[14px]"}>
                {saving ? t("common.loading") : t("common.save")}
              </button>
              <button type="button" onClick={() => save(null, "close")} disabled={saving} className={btnSecondary + " px-4 py-2 text-[14px]"}>
                {t("participantDetail.saveAndClose")}
              </button>
              {adjacent.next && (
                <button type="button" onClick={() => save(null, "next")} disabled={saving} className={btnPrimary}>
                  {t("participantDetail.saveAndNext")}
                </button>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

// One admin-defined field by its type; values are plain strings ("true"/"false" for booleans).
function FieldInput({ field, value, onChange }: { field: ParticipantFieldDef; value: string; onChange: (v: string) => void }) {
  if (field.fieldType === "boolean") {
    // Imported values like "Ano"/"x" count via the field's Ano/Ne setting; a value
    // meaning neither is shown so it isn't silently read as unticked.
    const b = toBoolean(value, field.options);
    return (
      <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
        <input type="checkbox" checked={b === "true"} onChange={(e) => onChange(String(e.target.checked))} />
        {field.label}
        {value && b === null && <span className="text-amber-700">({value} ?)</span>}
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
  // Text grows to fit its value (long health/questionnaire answers stay readable).
  if (field.fieldType === "text") return label(<AutoTextarea value={value} onChange={onChange} className={inputClass} />);
  return label(
    <input
      type={field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  );
}
