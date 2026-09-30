"use client";

import { Fragment, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import TemplateCheckModal from "@/components/participants/TemplateCheckModal";
import { useConfirm } from "@/components/ConfirmDialog";
import { readComposite } from "@/lib/participant-fields";

type FieldType = "text" | "number" | "date" | "boolean" | "select" | "image" | "composite";
type Surface = "list" | "health_list" | "health_detail" | "mail_list" | "documents" | "email" | "import";
type ModuleKey = "bills" | "health" | "mail" | "planning";
type FieldKind = "custom" | "builtin" | "guardian" | "computed";
type ComputedType = "effective_price" | "variable_symbol" | "payment_qr_image";

const FIELD_TYPES: FieldType[] = ["text", "number", "date", "boolean", "select", "composite"];
const SEPARATORS = [" ", ", ", " – ", "\n"];
const SURFACE_ON_CLASS = "bg-ink text-white";
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
  const confirm = useConfirm();
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
  // A new field's switches (same as the row pills); import too unless composite.
  const [newSurfaces, setNewSurfaces] = useState<Surface[]>(["email", "documents"]);
  // Composite ("Složené pole") being added/edited: part keys in order + separator.
  const [compositeParts, setCompositeParts] = useState<string[]>([]);
  const [compositeSep, setCompositeSep] = useState(" ");
  // Table toolbar.
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<FieldKind | "">("");
  const [surfaceFilter, setSurfaceFilter] = useState<Surface | "none" | "">("");
  const [sortBy, setSortBy] = useState<"order" | "label" | "key">("order");
  const [saving, setSaving] = useState(false);

  const [eventStartDate, setEventStartDate] = useState<string | null>(null);
  const [vsEventType, setVsEventType] = useState("0");
  const [vsOrderInYear, setVsOrderInYear] = useState("0");
  const [vsMembershipFieldKey, setVsMembershipFieldKey] = useState("");
  // Lower-cased values meaning "member"; null = not set yet (the defaults apply).
  const [vsMemberValues, setVsMemberValues] = useState<string[] | null>(null);
  // Every distinct value the chosen field has among this event's participants.
  const [membershipValuesFound, setMembershipValuesFound] = useState<string[]>([]);
  useEffect(() => {
    if (!isEvent || !vsMembershipFieldKey) return;
    fetch(`/api/events/${eventId}/participants`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { customFieldValues: Record<string, string> | null }[]) => {
        const found = new Map<string, string>();
        for (const r of rows) {
          const raw = (r.customFieldValues?.[vsMembershipFieldKey] ?? "").trim();
          if (raw && !found.has(raw.toLowerCase())) found.set(raw.toLowerCase(), raw);
        }
        setMembershipValuesFound([...found.values()].sort((a, b) => a.localeCompare(b, "cs")));
      })
      .catch(() => setMembershipValuesFound([]));
  }, [isEvent, eventId, vsMembershipFieldKey]);
  const DEFAULT_MEMBER_VALUES = ["true", "ano", "yes", "1"];
  const effectiveMemberValues = vsMemberValues ?? DEFAULT_MEMBER_VALUES;
  function toggleMemberValue(raw: string, on: boolean) {
    const v = raw.trim().toLowerCase();
    const next = new Set(effectiveMemberValues);
    if (on) next.add(v);
    else next.delete(v);
    setVsMemberValues([...next]);
  }
  const [vsSaving, setVsSaving] = useState(false);
  const [qrSizeMm, setQrSizeMm] = useState("35");
  const [qrSaving, setQrSaving] = useState(false);

  // Org scope has no module/event concept, no computed rows, no formula
  // config -- it only ever manages custom-field templates.
  const orgFields = isEvent ? fields : fields.filter((f) => f.kind === "custom");
  const customFields = fields.filter((f) => f.kind === "custom");
  const q = search.trim().toLowerCase();
  const visibleFields = orgFields
    .filter((f) => !q || f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q))
    .filter((f) => !kindFilter || f.kind === kindFilter)
    .filter((f) => {
      if (!surfaceFilter) return true;
      const surfaces = (isEvent ? f.surfaces : f.defaultSurfaces) ?? [];
      return surfaceFilter === "none" ? surfaces.filter((x) => x !== "import").length === 0 : surfaces.includes(surfaceFilter);
    });
  if (sortBy !== "order") {
    visibleFields.sort((a, b) => (sortBy === "label" ? a.label.localeCompare(b.label, "cs") : a.key.localeCompare(b.key)));
  }
  const computedFields = visibleFields.filter((f) => f.kind === "computed");
  const nonComputedFields = visibleFields.filter((f) => f.kind !== "computed");
  // Any custom field can say membership -- a checkbox, a select, or text like Ano/Ne.
  const membershipFieldOptions = customFields.filter((f) => f.fieldType === "boolean" || f.fieldType === "select" || f.fieldType === "text");


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
        vsMemberValues: string[] | null;
        qrSizeMm: number | null;
      } | null;
      if (ev) {
        setEventStartDate(ev.startDate);
        setVsEventType(String(ev.vsEventType ?? 0));
        setVsOrderInYear(String(ev.vsOrderInYear ?? 0));
        setVsMembershipFieldKey(ev.vsMembershipFieldKey ?? "");
        setVsMemberValues(Array.isArray(ev.vsMemberValues) && ev.vsMemberValues.length > 0 ? ev.vsMemberValues : null);
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

  function optionsPayload(): unknown {
    if (fieldType === "select") return optionsText.split(",").map((o) => o.trim()).filter(Boolean);
    if (fieldType === "composite") return { parts: compositeParts, separator: compositeSep };
    return undefined;
  }

  function resetAddForm() {
    setKey("");
    setFieldLabel("");
    setFieldType("text");
    setOptionsText("");
    setNewSurfaces(["email", "documents"]);
    setCompositeParts([]);
    setCompositeSep(" ");
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
    setOptionsText(Array.isArray(field.options) ? field.options.join(", ") : "");
    const cfg = readComposite(field.options);
    setCompositeParts(field.fieldType === "composite" ? cfg.parts : []);
    setCompositeSep(field.fieldType === "composite" ? cfg.separator : " ");
  }

  // Switches surfaces on one EXISTING field immediately -- the pill click.
  // Updated optimistically in local state first (no refetch, no flicker);
  // only re-synced from the server if the request actually fails.
  async function setFieldSurfaces(field: Field, which: Surface[], on: boolean) {
    const current = (isEvent ? field.surfaces : field.defaultSurfaces) ?? [];
    const next = on ? [...new Set([...current, ...which])] : current.filter((x) => !which.includes(x));
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

    const body: Record<string, unknown> = { key: key.trim(), label: fieldLabel.trim(), fieldType, options: optionsPayload() };
    const surfaces: Surface[] = fieldType === "composite" ? newSurfaces : [...newSurfaces, "import"];
    if (isEvent) body.surfaces = surfaces;
    else body.defaultSurfaces = surfaces;

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
      const ok = await confirm({
        message: t("participantFieldAdmin.confirmRename", { oldKey: field.key, newKey: key.trim() }),
        confirmLabel: t("participantFieldAdmin.confirmRenameButton"),
      });
      if (!ok) return;
    }
    setSaving(true);
    setError(null);
    const options = optionsPayload();
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
    if (!(await confirm({ message: t("listTemplateAdmin.confirmDelete", { name: field.label }), danger: true }))) return;
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
        ...(vsMemberValues && { vsMemberValues }),
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

  // Where the field shows up -- one pill per place, click to switch. "E-maily"
  // (`email`): the {{variable}} is offered in every e-mail template editor and
  // filled in e-mails; "Dokumenty" (`documents`): filled in generated documents.
  // Zdraví switches both health surfaces together.
  function pillDefs(): { label: string; surfaces: Surface[] }[] {
    return [
      { label: t("participantFieldAdmin.showInListLabel"), surfaces: ["list"] },
      ...(!isEvent || enabledModules.has("mail") ? [{ label: t("participantFieldAdmin.surface.mailList"), surfaces: ["mail_list"] as Surface[] }] : []),
      { label: t("participantFieldAdmin.surface.email"), surfaces: ["email"] },
      { label: t("participantFieldAdmin.surface.documents"), surfaces: ["documents"] },
      ...(!isEvent || enabledModules.has("health")
        ? [{ label: t("participantFieldAdmin.surface.health"), surfaces: ["health_list", "health_detail"] as Surface[] }]
        : []),
    ];
  }

  function surfacePills(field: Field) {
    const surfaces = (isEvent ? field.surfaces : field.defaultSurfaces) ?? [];
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {pillDefs().map((pill) => {
          const on = pill.surfaces.every((x) => surfaces.includes(x));
          return (
            <button
              key={pill.label}
              type="button"
              onClick={() => setFieldSurfaces(field, pill.surfaces, !on)}
              className={"rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors " + (on ? SURFACE_ON_CLASS : SURFACE_OFF_CLASS)}
            >
              {pill.label}
            </button>
          );
        })}
      </div>
    );
  }

  // Parts of a composite field, in order, and what joins them.
  function compositeEditor(selfKey: string) {
    const candidates = fields.filter((f) => f.active && f.fieldType !== "composite" && f.fieldType !== "image" && f.key !== selfKey);
    const labelOf = (k: string) => fields.find((f) => f.key === k)?.label ?? k;
    const move = (i: number, d: number) =>
      setCompositeParts((p) => {
        const next = [...p];
        [next[i], next[i + d]] = [next[i + d], next[i]];
        return next;
      });
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-mist bg-paper p-2 text-[12px] text-ink-secondary">
        <p>{t("participantFieldAdmin.compositeHint")}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {compositeParts.map((k, i) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-paper-2 px-2 py-0.5 text-[12px] text-ink">
              {i > 0 && (
                <button type="button" onClick={() => move(i, -1)} className="text-ink-secondary hover:text-ink" aria-label="←">
                  ‹
                </button>
              )}
              {labelOf(k)}
              {i < compositeParts.length - 1 && (
                <button type="button" onClick={() => move(i, 1)} className="text-ink-secondary hover:text-ink" aria-label="→">
                  ›
                </button>
              )}
              <button type="button" onClick={() => setCompositeParts((p) => p.filter((x) => x !== k))} className="text-red-600" aria-label={t("common.delete")}>
                ×
              </button>
            </span>
          ))}
          <select
            value=""
            onChange={(e) => e.target.value && setCompositeParts((p) => [...p, e.target.value])}
            className="rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[12px] text-ink"
          >
            <option value="">+ {t("participantFieldAdmin.compositeAddPart")}</option>
            {candidates
              .filter((f) => !compositeParts.includes(f.key))
              .map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span>{t("participantFieldAdmin.compositeSeparator")}</span>
          {SEPARATORS.map((sep) => (
            <button
              key={JSON.stringify(sep)}
              type="button"
              onClick={() => setCompositeSep(sep)}
              className={"rounded-full px-2 py-0.5 " + (compositeSep === sep ? SURFACE_ON_CLASS : SURFACE_OFF_CLASS)}
            >
              {sep === " " ? t("participantFieldAdmin.sepSpace") : sep === "\n" ? t("participantFieldAdmin.sepNewline") : `„${sep}“`}
            </button>
          ))}
          <input
            value={SEPARATORS.includes(compositeSep) ? "" : compositeSep}
            onChange={(e) => setCompositeSep(e.target.value)}
            placeholder={t("participantFieldAdmin.sepCustom")}
            className="w-24 rounded-lg border border-mist bg-paper-2 px-2 py-0.5 text-[12px] text-ink"
          />
        </div>
        {compositeParts.length > 0 && (
          <p className="font-mono text-[11.5px]">
            {compositeParts.map((k) => `{{${k}}}`).join(compositeSep === "\n" ? " ⏎ " : compositeSep === " " ? " ␣ " : compositeSep)}
          </p>
        )}
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
                {FIELD_TYPES.filter((ft) => isEvent || ft !== "composite").map((ft) => (
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
              {fieldType === "composite" && compositeEditor(field.key)}
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
                  {membershipFieldOptions.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              {vsMembershipFieldKey && (
                <div className="rounded-lg border border-mist bg-paper p-3 text-[12px] text-ink-secondary">
                  <p className="mb-1.5">{t("participantFieldAdmin.vsMemberValuesLabel")}</p>
                  {membershipValuesFound.length === 0 ? (
                    <p>{t("participantFieldAdmin.vsMemberValuesNone", { values: effectiveMemberValues.join(", ") })}</p>
                  ) : (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {membershipValuesFound.map((raw) => (
                        <label key={raw} className="flex items-center gap-1.5 text-[13px] text-ink">
                          <input
                            type="checkbox"
                            checked={effectiveMemberValues.includes(raw.trim().toLowerCase())}
                            onChange={(e) => toggleMemberValue(raw, e.target.checked)}
                          />
                          {raw === "true" ? "Ano (zaškrtnuto)" : raw === "false" ? "Ne (nezaškrtnuto)" : raw}
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="mt-1.5">{t("participantFieldAdmin.vsMemberValuesHint")}</p>
                </div>
              )}
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
          <td className="p-2 text-[12.5px] text-ink-secondary">
            <button type="button" onClick={() => setKindFilter(kindFilter === field.kind ? "" : field.kind)} title={t("participantFieldAdmin.filterByKind")} className="hover:text-ink hover:underline">
              {t(`participantFieldAdmin.kind.${field.kind}`)}
            </button>
          </td>
          <td className="p-2 text-[12.5px] text-ink-secondary">
            {t(`participantFieldAdmin.type.${field.fieldType}`)}
            {field.fieldType === "composite" && (
              <div className="font-mono text-[11px]">{readComposite(field.options).parts.map((k) => `{{${k}}}`).join(" + ") || "—"}</div>
            )}
          </td>
          <td className="p-2">{surfacePills(field)}</td>
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
            {FIELD_TYPES.filter((ft) => isEvent || ft !== "composite").map((ft) => (
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
          {fieldType === "composite" && compositeEditor(key.trim())}
          <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-secondary">
            <span>{t("participantFieldAdmin.surfacesLabel")}:</span>
            {pillDefs().map((pill) => {
              const on = pill.surfaces.every((x) => newSurfaces.includes(x));
              return (
                <button
                  key={pill.label}
                  type="button"
                  onClick={() => setNewSurfaces((cur) => (on ? cur.filter((x) => !pill.surfaces.includes(x)) : [...new Set([...cur, ...pill.surfaces])]))}
                  className={"rounded-full px-2.5 py-0.5 text-[11px] font-medium " + (on ? SURFACE_ON_CLASS : SURFACE_OFF_CLASS)}
                >
                  {pill.label}
                </button>
              );
            })}
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

      {!loading && orgFields.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("participantFieldAdmin.searchPlaceholder")}
            className="min-w-[180px] flex-1 rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember"
          />
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as FieldKind | "")} className="rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-ink">
            <option value="">{t("participantFieldAdmin.filterAllKinds")}</option>
            {(["custom", "builtin", "guardian", "computed"] as FieldKind[]).map((k) => (
              <option key={k} value={k}>
                {t(`participantFieldAdmin.kind.${k}`)}
              </option>
            ))}
          </select>
          <select value={surfaceFilter} onChange={(e) => setSurfaceFilter(e.target.value as Surface | "none" | "")} className="rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-ink">
            <option value="">{t("participantFieldAdmin.filterAnywhere")}</option>
            {pillDefs().map((pill) => (
              <option key={pill.label} value={pill.surfaces[0]}>
                {pill.label}
              </option>
            ))}
            <option value="none">{t("participantFieldAdmin.filterNowhere")}</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "order" | "label" | "key")} className="rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-ink">
            <option value="order">{t("participantFieldAdmin.sortOrder")}</option>
            <option value="label">{t("participantFieldAdmin.sortLabel")}</option>
            <option value="key">{t("participantFieldAdmin.sortKey")}</option>
          </select>
        </div>
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
