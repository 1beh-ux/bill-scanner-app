"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

type FieldType = "text" | "number" | "date" | "boolean" | "select" | "image";
type Surface = "list" | "health_list" | "health_detail" | "mail_list" | "documents" | "import";
type ModuleKey = "bills" | "health" | "mail";
type FieldKind = "custom" | "builtin" | "guardian" | "computed";
type ComputedType = "effective_price" | "variable_symbol" | "payment_qr_image";

const FIELD_TYPES: FieldType[] = ["text", "number", "date", "boolean", "select"];
const SURFACES: Surface[] = ["list", "health_list", "health_detail", "mail_list", "documents", "import"];
// Which module has to be enabled (on this event) before a surface's
// checkbox is worth showing at all -- undefined means always shown.
// `documents`/`import` are deliberately not module-gated: a field can be
// document-mergeable or importable regardless of which module it's
// otherwise scoped to (see src/lib/module-access.ts's allowedParticipantFieldKeys).
const SURFACE_MODULE: Partial<Record<Surface, ModuleKey>> = {
  health_list: "health",
  health_detail: "health",
  mail_list: "mail",
};

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

// One unified list for every field connected to a participant -- built-in
// columns (kind=builtin), guardian fields (kind=guardian), admin-defined
// custom fields (kind=custom), and computed values (kind=computed), each
// with the same "shown & used" surface checkboxes (including documents/
// import, which used to be a separate MergeVariable/"Include in documents"
// mechanism -- see src/lib/document-variables.ts and
// src/lib/fixed-participant-fields.ts). Only custom rows are addable,
// fully editable, or deletable; the rest are fixed system rows seeded per
// event (or, at org scope, not shown at all -- they don't have a template
// concept, see the `kind !== "custom"` filter below).
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

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Field | null>(null);
  const [key, setKey] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [surfaces, setSurfaces] = useState<Set<Surface>>(new Set());
  const [saving, setSaving] = useState(false);

  const [vsEventType, setVsEventType] = useState("0");
  const [vsOrderInYear, setVsOrderInYear] = useState("0");
  const [vsMembershipFieldKey, setVsMembershipFieldKey] = useState("");
  const [vsSaving, setVsSaving] = useState(false);

  // Org scope has no module/event concept, no computed rows, no formula
  // config -- it only ever manages custom-field templates.
  const orgFields = isEvent ? fields : fields.filter((f) => f.kind === "custom");
  const customFields = fields.filter((f) => f.kind === "custom");
  const computedFields = orgFields.filter((f) => f.kind === "computed");
  const nonComputedFields = orgFields.filter((f) => f.kind !== "computed");
  const booleanFieldOptions = customFields.filter((f) => f.fieldType === "boolean");

  // Surfaces tied to a module that's off for this event aren't worth
  // showing as a checkbox -- toggling one on wouldn't do anything visible
  // until the module itself is enabled. builtin rows (Name/date of
  // birth/group/status) are additionally restricted to documents/import:
  // their display surfaces are structural -- the roster and detail view
  // always show them via dedicated UI, never through the generic
  // surface-driven renderer -- so a list/health_list/etc checkbox on one
  // would be a no-op that looks like it does something.
  function surfacesFor(kind: FieldKind): Surface[] {
    const base = isEvent ? SURFACES.filter((s) => !SURFACE_MODULE[s] || enabledModules.has(SURFACE_MODULE[s]!)) : SURFACES;
    return kind === "builtin" ? base.filter((s) => s === "documents" || s === "import") : base;
  }
  const visibleSurfaces = surfacesFor(editing?.kind ?? "custom");

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
      const ev = eventData as { vsEventType: number | null; vsOrderInYear: number | null; vsMembershipFieldKey: string | null } | null;
      if (ev) {
        setVsEventType(String(ev.vsEventType ?? 0));
        setVsOrderInYear(String(ev.vsOrderInYear ?? 0));
        setVsMembershipFieldKey(ev.vsMembershipFieldKey ?? "");
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

  function resetForm() {
    setKey("");
    setFieldLabel("");
    setFieldType("text");
    setOptionsText("");
    setSurfaces(new Set());
    setEditing(null);
  }

  function openAdd() {
    setError(null);
    resetForm();
    setFormOpen(true);
  }

  function openEdit(field: Field) {
    setError(null);
    setEditing(field);
    setKey(field.key);
    setFieldLabel(field.label);
    setFieldType(field.fieldType);
    setOptionsText((field.options ?? []).join(", "));
    setSurfaces(new Set(isEvent ? field.surfaces ?? [] : field.defaultSurfaces ?? []));
    setFormOpen(true);
  }

  function toggleSurface(s: Surface) {
    setSurfaces((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isCustom = !editing || editing.kind === "custom";
    if (isCustom && (!fieldLabel.trim() || (!editing && !key.trim()))) return;
    setSaving(true);
    setError(null);

    const options = fieldType === "select" ? optionsText.split(",").map((o) => o.trim()).filter(Boolean) : undefined;

    const body: Record<string, unknown> = isCustom
      ? { label: fieldLabel.trim(), fieldType, options }
      : {};
    if (isEvent) body.surfaces = Array.from(surfaces);
    else body.defaultSurfaces = Array.from(surfaces);
    if (isCustom && !editing) body.key = key.trim();

    const res = editing
      ? await fetch(itemUrl(isEvent ? editing.id! : editing.key), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : await fetch(basePath, {
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
    setFormOpen(false);
    resetForm();
    load();
  }

  async function toggleActive(field: Field) {
    await fetch(itemUrl(isEvent ? field.id! : field.key), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !field.active }),
    });
    load();
  }

  async function handleDelete(field: Field) {
    if (!window.confirm(t("listTemplateAdmin.confirmDelete", { name: field.label }))) return;
    const res = await fetch(itemUrl(isEvent ? field.id! : field.key), { method: "DELETE" });
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
    setFormOpen(false);
  }

  function fieldRow(field: Field) {
    const allSurfaces = (isEvent ? field.surfaces : field.defaultSurfaces) ?? [];
    const rowSurfaces = surfacesFor(field.kind);
    const shownSurfaces = isEvent ? allSurfaces.filter((s) => rowSurfaces.includes(s)) : allSurfaces;
    const isCustom = field.kind === "custom";
    return (
      <li
        key={isEvent ? field.id : field.key}
        className="flex items-center justify-between gap-2 border-b border-mist/60 py-2"
      >
        <div className={(field.active ? "text-ink" : "text-ink-secondary line-through") + " flex flex-col"}>
          <span className="text-[14px] flex items-center gap-1.5">
            <span className={"inline-block h-[7px] w-[7px] rounded-full " + KIND_DOT[field.kind]} />
            {field.label}
            <span className="text-[11px] font-normal text-ink-secondary">
              {t(`participantFieldAdmin.kind.${field.kind}`)}
            </span>
          </span>
          <span className="text-[12px] text-ink-secondary">
            {`{{${field.key}}}`} · {t(`participantFieldAdmin.type.${field.fieldType}`)}
            {shownSurfaces.length > 0
              ? ` · ${shownSurfaces.map((s) => t(`participantFieldAdmin.surface.${s}`)).join(", ")}`
              : ""}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => toggleActive(field)} className="text-[12px] text-ink-secondary hover:text-ink">
            {field.active ? t("listTemplateAdmin.deactivate") : t("listTemplateAdmin.activate")}
          </button>
          <button onClick={() => openEdit(field)} className="text-[13px] text-ember hover:underline">
            {isCustom ? t("common.edit") : t("participantFieldAdmin.configure")}
          </button>
          {isCustom && (
            <button onClick={() => handleDelete(field)} className="text-[13px] text-red-600 hover:underline">
              {t("common.delete")}
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-ink">{label}</h3>
        <div className="flex items-center gap-3">
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

      {loading ? (
        <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>
      ) : orgFields.length === 0 ? (
        <p className="mb-4 text-[13px] text-ink-secondary">{t("listTemplateAdmin.empty")}</p>
      ) : (
        <ul className="mb-4 list-none p-0">
          {nonComputedFields.map(fieldRow)}
          {computedFields.length > 0 && (
            <>
              <li className="pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">
                {t("participantFieldAdmin.computedSection")}
              </li>
              {computedFields.map(fieldRow)}
            </>
          )}
        </ul>
      )}

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="mb-4 flex flex-col gap-2 rounded-lg border border-mist bg-paper-2 p-3"
        >
          {(!editing || editing.kind === "custom") ? (
            <>
              <input
                type="text"
                placeholder={t("participantFieldAdmin.keyLabel")}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                disabled={!!editing}
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
            </>
          ) : (
            <div className="text-[13px] text-ink-secondary">
              {editing.label} · {`{{${editing.key}}}`}
            </div>
          )}

          {editing?.kind === "computed" && editing.computedType === "effective_price" && (
            <p className="text-[12px] text-ink-secondary">{t("participantFieldAdmin.priceConfigHint")}</p>
          )}

          {isEvent && editing?.kind === "computed" && editing.computedType === "variable_symbol" && (
            <div className="flex flex-col gap-2 rounded-lg border border-mist p-2">
              <p className="text-[12px] font-medium text-ink">{t("participantFieldAdmin.vsConfigTitle")}</p>
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
              <button
                type="button"
                onClick={saveVsConfig}
                disabled={vsSaving}
                className={btnPrimary + " self-start"}
              >
                {vsSaving ? t("common.loading") : t("participantFieldAdmin.vsSaveButton")}
              </button>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <p className="text-[13px] text-ink-secondary">{t("participantFieldAdmin.surfacesLabel")}</p>
            {visibleSurfaces.map((s) => (
              <label key={s} className="flex items-center gap-2 text-[13px] text-ink">
                <input type="checkbox" checked={surfaces.has(s)} onChange={() => toggleSurface(s)} />
                {t(`participantFieldAdmin.surface.${s}`)}
              </label>
            ))}
          </div>

          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={() => setFormOpen(false)} className="text-[13px] text-ink-secondary hover:underline">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {t("common.save")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
