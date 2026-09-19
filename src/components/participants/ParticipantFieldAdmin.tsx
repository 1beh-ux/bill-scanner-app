"use client";

import { Fragment, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import TemplateCheckModal from "@/components/participants/TemplateCheckModal";

type FieldType = "text" | "number" | "date" | "boolean" | "select" | "image";
type Surface = "list" | "health_list" | "health_detail" | "mail_list" | "documents" | "import";
type ModuleKey = "bills" | "health" | "mail";
type FieldKind = "custom" | "builtin" | "guardian" | "computed";
type ComputedType = "effective_price" | "variable_symbol" | "payment_qr_image";

const FIELD_TYPES: FieldType[] = ["text", "number", "date", "boolean", "select"];
const SURFACES: Surface[] = ["list", "health_list", "health_detail", "mail_list", "documents", "import"];
// Which module has to be enabled (on this event) before a surface is worth
// offering at all -- undefined means always offered. `documents`/`import`
// are deliberately not module-gated: a field can be document-mergeable or
// importable regardless of which module it's otherwise scoped to (see
// src/lib/module-access.ts's allowedParticipantFieldKeys).
const SURFACE_MODULE: Partial<Record<Surface, ModuleKey>> = {
  health_list: "health",
  health_detail: "health",
  mail_list: "mail",
};
// Pill color when a surface is ON, by kind of surface -- display surfaces
// (where a value shows) get one color, the two merge-related surfaces
// (documents/import) get their own so they read as a different category of
// thing at a glance.
const SURFACE_ON_CLASS: Record<Surface, string> = {
  list: "bg-ink text-white",
  health_list: "bg-ink text-white",
  health_detail: "bg-ink text-white",
  mail_list: "bg-ink text-white",
  documents: "bg-[#6B5CA5] text-white",
  import: "bg-ember text-white",
};
const SURFACE_OFF_CLASS = "bg-[#EFEDE8] text-ink-secondary";

type Field = {
  id?: string; // event scope only
  key: string;
  label: string;
  fieldType: FieldType;
  options: string[] | null;
  surfaces?: Surface[]; // event scope only
  defaultSurfaces?: Surface[]; // org scope only
  kind: FieldKind;
  computedType?: ComputedType | null;
  active: boolean;
};

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const KIND_DOT: Record<FieldKind, string> = {
  custom: "bg-ember",
  builtin: "bg-ink-secondary",
  guardian: "bg-pine",
  computed: "bg-[#6B5CA5]",
};

interface ParticipantFieldAdminProps {
  scope: "org" | "event";
  eventId?: string;
  label: string;
}

function fieldId(isEvent: boolean, field: Field): string {
  return isEvent ? field.id! : field.key;
}

// One unified table for every field connected to a participant -- built-in
// columns (kind=builtin), guardian fields (kind=guardian), admin-defined
// custom fields (kind=custom), and computed values (kind=computed). Every
// field's surfaces (where it's shown/used, including documents/import --
// the old standalone MergeVariable/"Include in documents" mechanism, see
// src/lib/document-variables.ts) are pills you click directly in the row,
// no form to open, updated optimistically so a click never reloads the
// list. Only custom rows are addable, relabel/retype/rekey-able, or
// deletable; the rest are fixed system rows seeded per event (see
// src/lib/fixed-participant-fields.ts) -- at org scope they don't show at
// all, since a template concept doesn't apply to a fixed field.
export default function ParticipantFieldAdmin({ scope, eventId, label }: ParticipantFieldAdminProps) {
  const { t } = useTranslations();
  const isEvent = scope === "event";

  const basePath = isEvent ? `/api/events/${eventId}/participant-fields` : "/api/participant-field-templates";
  const listUrl = isEvent ? `${basePath}?all=true` : basePath;
  const itemUrl = (idOrKey: string) => `${basePath}/${encodeURIComponent(idOrKey)}`;

  const [fields, setFields] = useState<Field[]>([]);
  const [enabledModules, setEnabledModules] = useState<Set<ModuleKey>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [checkingTemplates, setCheckingTemplates] = useState(false);
  // Which existing row's edit panel is expanded, directly under that row
  // (accordion -- at most one at a time). Separate from `adding`, which
  // controls the "new field" panel at the top of the list.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [key, setKey] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [newSurfaces, setNewSurfaces] = useState<Set<Surface>>(new Set());
  const [saving, setSaving] = useState(false);

  const [eventStartDate, setEventStartDate] = useState<string | null>(null);
  const [vsEventType, setVsEventType] = useState("0");
  const [vsOrderInYear, setVsOrderInYear] = useState("0");
  const [vsMembershipFieldKey, setVsMembershipFieldKey] = useState("");
  const [vsSaving, setVsSaving] = useState(false);
  const [qrSizeMm, setQrSizeMm] = useState("35");
  const [qrSaving, setQrSaving] = useState(false);

  // Org scope has no module/event concept, no computed rows, no formula
  // config -- it only ever manages custom-field templates.
  const orgFields = isEvent ? fields : fields.filter((f) => f.kind === "custom");
  const customFields = fields.filter((f) => f.kind === "custom");
  const computedFields = orgFields.filter((f) => f.kind === "computed");
  const nonComputedFields = orgFields.filter((f) => f.kind !== "computed");
  const booleanFieldOptions = customFields.filter((f) => f.fieldType === "boolean");

  // Which surfaces are worth offering (as pills or, for a new field, as
  // checkboxes) for a given kind:
  //  - builtin: the roster/detail already show these via dedicated UI, so
  //    only documents/import are real toggles -- a list/health_list pill
  //    would be a no-op that looks like it does something.
  //  - computed: no health_list/mail_list/import (there's no health-module
  //    or mail-module screen for price/VS/QR, and nothing to import into).
  //  - guardian/custom: the full module-gated set.
  function surfacesFor(kind: FieldKind): Surface[] {
    const base = isEvent ? SURFACES.filter((s) => !SURFACE_MODULE[s] || enabledModules.has(SURFACE_MODULE[s]!)) : SURFACES;
    if (kind === "builtin") return base.filter((s) => s === "documents" || s === "import");
    if (kind === "computed") return base.filter((s) => s === "list" || s === "documents");
    return base;
  }

  async function load() {
    setLoading(true);
    const requests: Promise<unknown>[] = [fetch(listUrl).then((r) => (r.ok ? r.json() : []))];
    if (isEvent) {
      requests.push(
        fetch(`/api/events/${eventId}/modules/mine`)
          .then((r) => (r.ok ? r.json() : {}))
          .catch(() => ({}))
      );
      requests.push(
        fetch(`/api/events/${eventId}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      );
    }
    const [fieldsData, moduleAccess, eventData] = await Promise.all(requests);
    setFields(fieldsData as Field[]);
    if (isEvent) {
      const access = moduleAccess as Record<string, boolean>;
      setEnabledModules(new Set((Object.keys(access) as ModuleKey[]).filter((k) => access[k])));
      const ev = eventData as {
        startDate: string | null;
        vsEventType: number | null;
        vsOrderInYear: number | null;
        vsMembershipFieldKey: string | null;
        qrSizeMm: number | null;
      } | null;
      if (ev) {
        setEventStartDate(ev.startDate);
        setVsEventType(String(ev.vsEventType ?? 0));
        setVsOrderInYear(String(ev.vsOrderInYear ?? 0));
        setVsMembershipFieldKey(ev.vsMembershipFieldKey ?? "");
        setQrSizeMm(String(ev.qrSizeMm ?? 35));
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, eventId]);

  async function syncFromTemplates() {
    setSyncing(true);
    setError(null);
    const res = await fetch(`${basePath}/sync`, { method: "POST" });
    setSyncing(false);
    if (!res.ok) {
      setError(t("listTemplateAdmin.errorSyncFailed"));
      return;
    }
    load();
  }

  function resetAddForm() {
    setKey("");
    setFieldLabel("");
    setFieldType("text");
    setOptionsText("");
    setNewSurfaces(new Set());
  }

  function openAdd() {
    setError(null);
    setExpandedId(null);
    resetAddForm();
    setAdding(true);
  }

  function toggleExpanded(field: Field) {
    setError(null);
    setAdding(false);
    const id = fieldId(isEvent, field);
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setKey(field.key);
    setFieldLabel(field.label);
    setFieldType(field.fieldType);
    setOptionsText((field.options ?? []).join(", "));
  }

  function toggleNewSurface(s: Surface) {
    setNewSurfaces((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  // Flips one surface on one EXISTING field immediately -- the pill click.
  // Updated optimistically in local state first (no refetch, no flicker);
  // only re-synced from the server if the request actually fails.
  async function toggleFieldSurface(field: Field, s: Surface) {
    const current = (isEvent ? field.surfaces : field.defaultSurfaces) ?? [];
    const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
    setFields((prev) =>
      prev.map((f) =>
        fieldId(isEvent, f) === fieldId(isEvent, field)
          ? { ...f, ...(isEvent ? { surfaces: next } : { defaultSurfaces: next }) }
          : f
      )
    );
    const res = await fetch(itemUrl(fieldId(isEvent, field)), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEvent ? { surfaces: next } : { defaultSurfaces: next }),
    });
    if (!res.ok) load(); // roll back to server truth on failure
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fieldLabel.trim() || !key.trim()) return;
    setSaving(true);
    setError(null);

    const options = fieldType === "select" ? optionsText.split(",").map((o) => o.trim()).filter(Boolean) : undefined;
    const body: Record<string, unknown> = { key: key.trim(), label: fieldLabel.trim(), fieldType, options };
    if (isEvent) body.surfaces = Array.from(newSurfaces);
    else body.defaultSurfaces = Array.from(newSurfaces);

    const res = await fetch(basePath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error === "invalid_key" ? t("participantFieldAdmin.errorInvalidKey") : t("listTemplateAdmin.errorSaveFailed"));
      return;
    }
    setAdding(false);
    resetAddForm();
    load();
  }

  // Saves label/type/options/key for an existing custom field. Renaming
  // the key ({{oldKey}} -> {{newKey}}) needs an explicit confirmation --
  // it moves every participant's stored value to the new key (server
  // side), but can't touch a {{oldKey}} placeholder already typed into a
  // Google Doc template or an email body, so those would stop resolving.
  async function handleEditSubmit(field: Field, e: React.FormEvent) {
    e.preventDefault();
    if (!fieldLabel.trim() || !key.trim()) return;
    const keyChanged = key.trim() !== field.key;
    if (keyChanged) {
      const ok = window.confirm(
        t("participantFieldAdmin.confirmRename", { oldKey: field.key, newKey: key.trim() })
      );
      if (!ok) return;
    }
    setSaving(true);
    setError(null);
    const options = fieldType === "select" ? optionsText.split(",").map((o) => o.trim()).filter(Boolean) : undefined;
    const res = await fetch(itemUrl(fieldId(isEvent, field)), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(keyChanged && { key: key.trim() }),
        label: fieldLabel.trim(),
        fieldType,
        options,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error === "key_taken" ? t("participantFieldAdmin.errorKeyTaken") : t("listTemplateAdmin.errorSaveFailed"));
      return;
    }
    setExpandedId(null);
    load();
  }

  async function toggleActive(field: Field) {
    await fetch(itemUrl(fieldId(isEvent, field)), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !field.active }),
    });
    load();
  }

  async function handleDelete(field: Field) {
    if (!window.confirm(t("listTemplateAdmin.confirmDelete", { name: field.label }))) return;
    const res = await fetch(itemUrl(fieldId(isEvent, field)), { method: "DELETE" });
    if (!res.ok) {
      setError(t("listTemplateAdmin.errorDeleteFailed"));
      return;
    }
    load();
  }

  async function saveVsConfig() {
    setVsSaving(true);
    await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vsEventType: Number(vsEventType) || 0,
        vsOrderInYear: Number(vsOrderInYear) || 0,
        vsMembershipFieldKey: vsMembershipFieldKey || null,
      }),
    });
    setVsSaving(false);
    setExpandedId(null);
  }

  async function saveQrSize() {
    setQrSaving(true);
    await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qrSizeMm: Number(qrSizeMm) || 35 }),
    });
    setQrSaving(false);
    setExpandedId(null);
  }

  function pillsRow(field: Field) {
    const active = (isEvent ? field.surfaces : field.defaultSurfaces) ?? [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {surfacesFor(field.kind).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggleFieldSurface(field, s)}
            className={
              "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors " +
              (active.includes(s) ? SURFACE_ON_CLASS[s] : SURFACE_OFF_CLASS)
            }
          >
            {t(`participantFieldAdmin.surface.${s}`)}
          </button>
        ))}
      </div>
    );
  }

  // Live example of the composed variable symbol as vsEventType/
  // vsOrderInYear change -- year comes from the real event start date,
  // sequence is a placeholder (a real participant's is assigned at
  // acceptance), membership is shown both ways since it varies per person.
  function vsPreview() {
    const year = eventStartDate ? String(new Date(eventStartDate).getUTCFullYear() % 100).padStart(2, "0") : "··";
    const type = String(Number(vsEventType) || 0).slice(-1);
    const order = String(Number(vsOrderInYear) || 0).slice(-1);
    const seq = "0001";
    const digits: { value: string; label: string; color: string }[] = [
      { value: year, label: t("participantFieldAdmin.vsPreviewYear"), color: "#1B1F27" },
      { value: type, label: t("participantFieldAdmin.vsPreviewType"), color: "#6B675F" },
      { value: order, label: t("participantFieldAdmin.vsPreviewOrder"), color: "#6B675F" },
      { value: "0/1", label: t("participantFieldAdmin.vsPreviewMembership"), color: "#C2652E" },
      { value: seq, label: t("participantFieldAdmin.vsPreviewSequence"), color: "#6B5CA5" },
    ];
    return (
      <div className="rounded-lg bg-paper p-4">
        <div className="flex items-start justify-center gap-3">
          {digits.map((d, i) => (
            <div key={i} className="flex w-[76px] flex-col items-center">
              <div
                className="w-full rounded-md py-1.5 text-center font-mono text-[15px] font-semibold text-white"
                style={{ background: d.color }}
              >
                {d.value}
              </div>
              <div className="mt-1 text-center text-[10px] leading-tight text-ink-secondary">{d.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center font-mono text-[13px] text-ink-secondary">
          {t("participantFieldAdmin.vsPreviewNonMember")} {year}{type}{order}0{seq} · {t("participantFieldAdmin.vsPreviewMember")} {year}{type}{order}1{seq}
        </p>
      </div>
    );
  }

  function editPanel(field: Field) {
    const isCustom = field.kind === "custom";
    return (
      <tr>
        <td colSpan={5} className="border-b border-mist/60 bg-paper px-3 py-3">
          {isCustom && (
            <form onSubmit={(e) => handleEditSubmit(field, e)} className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[12px] text-ink-secondary">
                  {t("participantFieldAdmin.keyLabel")}
                  <input
                    type="text"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    className={inputClass + " mt-1"}
                  />
                </label>
                <label className="text-[12px] text-ink-secondary">
                  {t("common.name")}
                  <input
                    type="text"
                    value={fieldLabel}
                    onChange={(e) => setFieldLabel(e.target.value)}
                    className={inputClass + " mt-1"}
                    autoFocus
                  />
                </label>
              </div>
              {key.trim() !== field.key && (
                <p className="rounded-lg border border-[#EBDFC4] bg-[#FBF6ED] px-3 py-2 text-[11.5px] text-[#8A6A1F]">
                  {t("participantFieldAdmin.renameWarning")}
                </p>
              )}
              <select value={fieldType} onChange={(e) => setFieldType(e.target.value as FieldType)} className={inputClass}>
                {FIELD_TYPES.map((ft) => (
                  <option key={ft} value={ft}>
                    {t(`participantFieldAdmin.type.${ft}`)}
                  </option>
                ))}
              </select>
              {fieldType === "select" && (
                <input
                  type="text"
                  placeholder={t("participantFieldAdmin.optionsLabel")}
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                  className={inputClass}
                />
              )}
              <div className="mt-1 flex justify-end gap-2">
                <button type="button" onClick={() => setExpandedId(null)} className="text-[13px] text-ink-secondary hover:underline">
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={saving} className={btnPrimary}>
                  {saving ? t("common.loading") : t("common.save")}
                </button>
              </div>
            </form>
          )}

          {field.kind === "computed" && field.computedType === "effective_price" && (
            <p className="text-[12px] text-ink-secondary">{t("participantFieldAdmin.priceConfigHint")}</p>
          )}

          {field.kind === "computed" && field.computedType === "payment_qr_image" && (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-ink-secondary">{t("participantFieldAdmin.qrConfigHint")}</p>
              {isEvent && (
                <>
                  <label className="max-w-[220px] text-[12px] text-ink-secondary">
                    {t("participantFieldAdmin.qrSizeLabel")}
                    <input
                      type="number"
                      min={10}
                      max={150}
                      value={qrSizeMm}
                      onChange={(e) => setQrSizeMm(e.target.value)}
                      className={inputClass + " mt-1"}
                    />
                  </label>
                  <p className="text-[12px] text-ink-secondary">{t("participantFieldAdmin.qrSizeHint")}</p>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setExpandedId(null)} className="text-[13px] text-ink-secondary hover:underline">
                      {t("common.cancel")}
                    </button>
                    <button type="button" onClick={saveQrSize} disabled={qrSaving} className={btnPrimary}>
                      {qrSaving ? t("common.loading") : t("participantFieldAdmin.vsSaveButton")}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {isEvent && field.kind === "computed" && field.computedType === "variable_symbol" && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[12px] text-ink-secondary">
                  {t("participantFieldAdmin.vsEventTypeLabel")}
                  <input
                    type="number"
                    min={0}
                    max={9}
                    value={vsEventType}
                    onChange={(e) => setVsEventType(e.target.value)}
                    className={inputClass + " mt-1"}
                  />
                </label>
                <label className="text-[12px] text-ink-secondary">
                  {t("participantFieldAdmin.vsOrderInYearLabel")}
                  <input
                    type="number"
                    min={0}
                    max={9}
                    value={vsOrderInYear}
                    onChange={(e) => setVsOrderInYear(e.target.value)}
                    className={inputClass + " mt-1"}
                  />
                </label>
              </div>
              <label className="text-[12px] text-ink-secondary">
                {t("participantFieldAdmin.vsMembershipFieldLabel")}
                <select
                  value={vsMembershipFieldKey}
                  onChange={(e) => setVsMembershipFieldKey(e.target.value)}
                  className={inputClass + " mt-1"}
                >
                  <option value="">{t("common.none")}</option>
                  {booleanFieldOptions.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              {vsPreview()}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setExpandedId(null)} className="text-[13px] text-ink-secondary hover:underline">
                  {t("common.cancel")}
                </button>
                <button type="button" onClick={saveVsConfig} disabled={vsSaving} className={btnPrimary}>
                  {vsSaving ? t("common.loading") : t("participantFieldAdmin.vsSaveButton")}
                </button>
              </div>
            </div>
          )}
        </td>
      </tr>
    );
  }

  function fieldRow(field: Field) {
    const id = fieldId(isEvent, field);
    const isCustom = field.kind === "custom";
    const isExpanded = expandedId === id;
    const hasPanel = isCustom || field.kind === "computed";
    return (
      <>
        <tr key={id} className="border-b border-mist/60 align-top">
          <td className={"p-2 " + (field.active ? "" : "opacity-50")}>
            <div className="flex items-center gap-1.5 text-[14px] text-ink">
              <span className={"inline-block h-[7px] w-[7px] shrink-0 rounded-full " + KIND_DOT[field.kind]} />
              {field.label}
            </div>
            <div className="pl-3.5 font-mono text-[11.5px] text-ink-secondary">{`{{${field.key}}}`}</div>
          </td>
          <td className="p-2 text-[12.5px] text-ink-secondary">{t(`participantFieldAdmin.kind.${field.kind}`)}</td>
          <td className="p-2 text-[12.5px] text-ink-secondary">{t(`participantFieldAdmin.type.${field.fieldType}`)}</td>
          <td className="p-2">{pillsRow(field)}</td>
          <td className="whitespace-nowrap p-2 text-right">
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => toggleActive(field)} className="text-[12px] text-ink-secondary hover:text-ink">
                {field.active ? t("listTemplateAdmin.deactivate") : t("listTemplateAdmin.activate")}
              </button>
              {hasPanel && (
                <button onClick={() => toggleExpanded(field)} className="text-[13px] text-ember hover:underline">
                  {isExpanded ? t("common.cancel") : isCustom ? t("common.edit") : t("participantFieldAdmin.configure")}
                </button>
              )}
              {isCustom && (
                <button onClick={() => handleDelete(field)} className="text-[13px] text-red-600 hover:underline">
                  {t("common.delete")}
                </button>
              )}
            </div>
          </td>
        </tr>
        {isExpanded && editPanel(field)}
      </>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-ink">{label}</h3>
        <div className="flex items-center gap-3">
          {isEvent && (
            <button
              onClick={() => setCheckingTemplates(true)}
              className="text-[13px] text-ink-secondary hover:text-ink"
            >
              {t("templateCheck.button")}
            </button>
          )}
          {isEvent && (
            <button
              onClick={syncFromTemplates}
              disabled={syncing}
              className="text-[13px] text-ink-secondary hover:text-ink disabled:opacity-50"
            >
              {syncing ? t("common.loading") : t("listTemplateAdmin.syncFromTemplates")}
            </button>
          )}
          <button onClick={openAdd} className="text-[13px] text-ember hover:underline">
            {t("common.add")}
          </button>
        </div>
      </div>

      {isEvent && (
        <p className="mb-3 rounded-lg border border-[#EBDFC4] bg-[#FBF6ED] px-3 py-2 text-[11.5px] text-[#8A6A1F]">
          {t("participantFieldAdmin.campNameHint")}
        </p>
      )}

      {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}

      {adding && (
        <form
          onSubmit={handleAddSubmit}
          className="mb-4 flex flex-col gap-2 rounded-lg border border-mist bg-paper-2 p-3"
        >
          <input
            type="text"
            placeholder={t("participantFieldAdmin.keyLabel")}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className={inputClass}
            autoFocus
          />
          <input
            type="text"
            placeholder={t("common.name")}
            value={fieldLabel}
            onChange={(e) => setFieldLabel(e.target.value)}
            className={inputClass}
          />
          <select value={fieldType} onChange={(e) => setFieldType(e.target.value as FieldType)} className={inputClass}>
            {FIELD_TYPES.map((ft) => (
              <option key={ft} value={ft}>
                {t(`participantFieldAdmin.type.${ft}`)}
              </option>
            ))}
          </select>
          {fieldType === "select" && (
            <input
              type="text"
              placeholder={t("participantFieldAdmin.optionsLabel")}
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              className={inputClass}
            />
          )}
          <div className="flex flex-col gap-1.5">
            <p className="text-[13px] text-ink-secondary">{t("participantFieldAdmin.surfacesLabel")}</p>
            {surfacesFor("custom").map((s) => (
              <label key={s} className="flex items-center gap-2 text-[13px] text-ink">
                <input type="checkbox" checked={newSurfaces.has(s)} onChange={() => toggleNewSurface(s)} />
                {t(`participantFieldAdmin.surface.${s}`)}
              </label>
            ))}
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="text-[13px] text-ink-secondary hover:underline">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>
      ) : orgFields.length === 0 ? (
        <p className="mb-4 text-[13px] text-ink-secondary">{t("listTemplateAdmin.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-mist text-left">
                <th className="p-2 text-[11px] font-medium uppercase tracking-wide text-ink-secondary">
                  {t("participantFieldAdmin.colField")}
                </th>
                <th className="p-2 text-[11px] font-medium uppercase tracking-wide text-ink-secondary">
                  {t("participantFieldAdmin.colKind")}
                </th>
                <th className="p-2 text-[11px] font-medium uppercase tracking-wide text-ink-secondary">
                  {t("participantFieldAdmin.colType")}
                </th>
                <th className="p-2 text-[11px] font-medium uppercase tracking-wide text-ink-secondary">
                  {t("participantFieldAdmin.surfacesLabel")}
                </th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {nonComputedFields.map((f) => <Fragment key={fieldId(isEvent, f)}>{fieldRow(f)}</Fragment>)}
              {computedFields.length > 0 && (
                <tr>
                  <td colSpan={5} className="pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">
                    {t("participantFieldAdmin.computedSection")}
                  </td>
                </tr>
              )}
              {computedFields.map((f) => <Fragment key={fieldId(isEvent, f)}>{fieldRow(f)}</Fragment>)}
            </tbody>
          </table>
        </div>
      )}
      {checkingTemplates && (
        <TemplateCheckModal eventId={eventId!} onClose={() => setCheckingTemplates(false)} onApplied={load} />
      )}
    </div>
  );
}
