"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

type FieldType = "text" | "number" | "date" | "boolean" | "select";
type Surface = "list" | "health_list" | "health_detail" | "mail_list";
type ModuleKey = "bills" | "health" | "mail";

const FIELD_TYPES: FieldType[] = ["text", "number", "date", "boolean", "select"];
const SURFACES: Surface[] = ["list", "health_list", "health_detail", "mail_list"];
// Which module has to be enabled (on this event) before a surface's
// checkbox is worth showing at all -- undefined means always shown.
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
  includeInDocuments: boolean;
  active: boolean;
};

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

interface ParticipantFieldAdminProps {
  scope: "org" | "event";
  eventId?: string;
  label: string;
}

// Mirrors ListTemplateAdmin's org/event sync pattern, but a dedicated
// component -- fields have a different shape (immutable key, typed +
// options, surfaces) that doesn't fit ListTemplateAdmin's
// ListTemplateKind-shaped API.
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
  const [includeInDocuments, setIncludeInDocuments] = useState(true);
  const [saving, setSaving] = useState(false);

  // Surfaces tied to a module that's off for this event aren't worth
  // showing as a checkbox -- toggling one on wouldn't do anything visible
  // until the module itself is enabled (see the modules PATCH route's
  // enable hook for what backfills automatically once it is).
  const visibleSurfaces = isEvent
    ? SURFACES.filter((s) => !SURFACE_MODULE[s] || enabledModules.has(SURFACE_MODULE[s]!))
    : SURFACES;

  async function load() {
    setLoading(true);
    const requests: Promise<unknown>[] = [fetch(listUrl).then((r) => (r.ok ? r.json() : []))];
    if (isEvent) {
      requests.push(
        fetch(`/api/events/${eventId}/modules/mine`)
          .then((r) => (r.ok ? r.json() : {}))
          .catch(() => ({}))
      );
    }
    const [fieldsData, moduleAccess] = await Promise.all(requests);
    setFields(fieldsData as Field[]);
    if (isEvent) {
      const access = moduleAccess as Record<string, boolean>;
      setEnabledModules(new Set((Object.keys(access) as ModuleKey[]).filter((k) => access[k])));
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
    setIncludeInDocuments(true);
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
    setIncludeInDocuments(field.includeInDocuments);
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
    if (!fieldLabel.trim() || (!editing && !key.trim())) return;
    setSaving(true);
    setError(null);

    const options = fieldType === "select" ? optionsText.split(",").map((o) => o.trim()).filter(Boolean) : undefined;

    const body: Record<string, unknown> = {
      label: fieldLabel.trim(),
      fieldType,
      options,
      includeInDocuments,
    };
    if (isEvent) body.surfaces = Array.from(surfaces);
    else body.defaultSurfaces = Array.from(surfaces);
    if (!editing) body.key = key.trim();

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

      {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}

      {loading ? (
        <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>
      ) : fields.length === 0 ? (
        <p className="mb-4 text-[13px] text-ink-secondary">{t("listTemplateAdmin.empty")}</p>
      ) : (
        <ul className="mb-4 list-none p-0">
          {fields.map((field) => {
            // Filter to visibleSurfaces so a field's stored health/mail
            // surfaces don't show as text once that module is disabled for
            // this event -- the data isn't lost (see toggleSurface/submit),
            // it's just not worth displaying until the module is back on.
            const allSurfaces = (isEvent ? field.surfaces : field.defaultSurfaces) ?? [];
            const shownSurfaces = isEvent ? allSurfaces.filter((s) => visibleSurfaces.includes(s)) : allSurfaces;
            return (
              <li
                key={isEvent ? field.id : field.key}
                className="flex items-center justify-between gap-2 border-b border-mist/60 py-2"
              >
                <div className={active(field) + " flex flex-col"}>
                  <span className="text-[14px]">{field.label}</span>
                  <span className="text-[12px] text-ink-secondary">
                    {`{{${field.key}}}`} · {t(`participantFieldAdmin.type.${field.fieldType}`)}
                    {shownSurfaces.length > 0
                      ? ` · ${shownSurfaces.map((s) => t(`participantFieldAdmin.surface.${s}`)).join(", ")}`
                      : ""}
                    {field.includeInDocuments ? ` · ${t("participantFieldAdmin.includeInDocumentsShort")}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleActive(field)} className="text-[12px] text-ink-secondary hover:text-ink">
                    {field.active ? t("listTemplateAdmin.deactivate") : t("listTemplateAdmin.activate")}
                  </button>
                  <button onClick={() => openEdit(field)} className="text-[13px] text-ember hover:underline">
                    {t("common.edit")}
                  </button>
                  <button onClick={() => handleDelete(field)} className="text-[13px] text-red-600 hover:underline">
                    {t("common.delete")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="mb-4 flex flex-col gap-2 rounded-lg border border-mist bg-paper-2 p-3"
        >
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
          <div className="flex flex-col gap-1.5">
            <p className="text-[13px] text-ink-secondary">
              {isEvent ? t("participantFieldAdmin.surfacesLabel") : t("participantFieldAdmin.defaultSurfacesLabel")}
            </p>
            {visibleSurfaces.map((s) => (
              <label key={s} className="flex items-center gap-2 text-[13px] text-ink">
                <input type="checkbox" checked={surfaces.has(s)} onChange={() => toggleSurface(s)} />
                {t(`participantFieldAdmin.surface.${s}`)}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={includeInDocuments}
              onChange={(e) => setIncludeInDocuments(e.target.checked)}
            />
            {t("participantFieldAdmin.includeInDocumentsLabel")}
          </label>
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

function active(field: Field): string {
  return field.active ? "text-ink" : "text-ink-secondary line-through";
}
