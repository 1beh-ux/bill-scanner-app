"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { docsUsing, type FmDocTemplate, type FmOverview, type OvField } from "./types";
import { RenameDialog } from "./FieldEditors";
import { FIXED_PARTICIPANT_FIELDS } from "@/lib/fixed-participant-fields";

// A key the app itself defines (name, birth date, guardian...) -- the server refuses to rename it anyway.
const FIXED_KEYS = new Set(FIXED_PARTICIPANT_FIELDS.map((f) => f.key));

// The field-details card (Fields Manager phase 2, read-only): what a field is, where its values live, where it
// comes from and where it is used. Phase 2b embeds it in the roster, health, mail and documents screens.
// onChanged set = editable (Fields tab, phase 3a): storage, required here, the organization default.
export default function FieldCard({ field, overview, docs, onShowInGraph, onChanged, onRenamed }: { field: OvField; overview: FmOverview; docs: FmDocTemplate[] | null; onShowInGraph?: () => void; onChanged?: () => void; onRenamed?: (from: string, to: string, logId: string) => void }) {
  const { t } = useTranslations();
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/fields/${encodeURIComponent(field.key)}?event=${encodeURIComponent(overview.eventId ?? "")}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(t("fieldsManager.saveFailed"));
    onChanged?.();
  }
  const editable = !!onChanged;
  const sourceLabel = (id: string) => {
    const s = overview.sources.find((x) => x.id === id);
    return s ? (s.label ?? t(s.labelKey ?? "")) : id;
  };
  const usedIn = docsUsing(field, docs);
  const tag = "rounded-full border border-mist px-2 py-0.5 text-[11px] text-ink-secondary";

  return (
    <div className="rounded-xl border border-mist bg-paper p-4 text-[13px]">
      <h3 className="text-[15px] font-semibold text-ink">{field.label}</h3>
      <div className="mt-0.5 font-mono text-[12px] text-ink-secondary">{field.key}</div>
      <div className="mt-2 flex flex-wrap gap-1">
        <span className={tag}>{t(`fieldsManager.type.${field.fieldType}`)}</span>
        {field.required && <span className="rounded-full bg-pine-bg px-2 py-0.5 text-[11px] text-pine">{t("fieldsManager.required")}</span>}
        {!field.active && <span className={tag}>{t("fieldsManager.inactive")}</span>}
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
        {field.calculated && field.deps.length > 0 && (
          <>
            <dt className="text-ink-secondary">{t("fieldsManager.builtFrom")}</dt>
            <dd className="font-mono">{field.deps.join(", ")}</dd>
          </>
        )}
        <dt className="text-ink-secondary">{t("fieldsManager.storedValues")}</dt>
        <dd>
          {field.calculated
            ? t("fieldsManager.neverStored")
            : t("fieldsManager.storedCounts", { profiles: String(field.values.profiles), registrations: String(field.values.registrations) })}
        </dd>
        <dt className="text-ink-secondary">{t("fieldsManager.comesFrom")}</dt>
        <dd>{field.sources.length ? field.sources.map(sourceLabel).join(", ") : "—"}</dd>
        <dt className="text-ink-secondary">{t("fieldsManager.usedIn")}</dt>
        <dd>{field.uses.length ? field.uses.map((u) => t(`fieldsManager.use.${u}`)).join(", ") : "—"}</dd>
        <dt className="text-ink-secondary">{t("fieldsManager.documents")}</dt>
        <dd>{docs === null ? t("fieldsManager.loading") : usedIn.length ? usedIn.map((d) => d.name).join(", ") : "—"}</dd>
        {field.portalAccess && (
          <>
            <dt className="text-ink-secondary">{t("fieldsManager.portal")}</dt>
            <dd>{t(`fieldsManager.portalAccess.${field.portalAccess}`)}</dd>
          </>
        )}
        {field.requiredDefault !== null && (
          <>
            <dt className="text-ink-secondary">{t("fieldsManager.requiredHere")}</dt>
            <dd>
              {editable && field.kind === "custom" ? (
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" disabled={busy} checked={field.required} onChange={(e) => patch({ required: e.target.checked })} />
                  {field.required ? t("fieldsManager.yes") : t("fieldsManager.no")}
                </label>
              ) : field.required ? (
                t("fieldsManager.yes")
              ) : (
                t("fieldsManager.no")
              )}
              <span className="text-ink-secondary"> · {t("fieldsManager.requiredDefault")}: {field.requiredDefault ? t("fieldsManager.yes") : t("fieldsManager.no")}</span>
              {editable && field.requiredDefault !== field.required && (
                <button type="button" disabled={busy} onClick={() => patch({ requiredDefault: field.required })} className="ml-2 rounded border border-mist px-1.5 text-[11px] hover:bg-paper-2">
                  {t("fieldsManager.setAsDefault")}
                </button>
              )}
            </dd>
          </>
        )}
        {field.aliases.length > 0 && (
          <>
            <dt className="text-ink-secondary">{t("fieldsManager.aliases")}</dt>
            <dd className="font-mono">{field.aliases.join(", ")}</dd>
          </>
        )}
      </dl>
      {error && <p className="mt-2 text-[12px] text-red-700">{error}</p>}
      {/* Fixed fields (name, birth date, guardian...) can't be renamed: no button at all (staging test 2026-11-22). */}
      {editable && field.kind === "custom" && field.storage !== "fixed" && field.storage !== "guardian" && !FIXED_KEYS.has(field.key) && !renaming && (
        <button type="button" onClick={() => setRenaming(true)} className="mr-2 mt-3 rounded-lg border border-mist px-2.5 py-1 text-[12px] hover:bg-paper-2">
          {t("fieldsManager.renameKey")}
        </button>
      )}
      {renaming && (
        <RenameDialog
          field={field}
          onDone={(to, logId) => {
            setRenaming(false);
            if (to && logId) onRenamed?.(field.key, to, logId);
          }}
        />
      )}
      {onShowInGraph && (
        <button type="button" onClick={onShowInGraph} className="mt-3 rounded-lg border border-mist px-2.5 py-1 text-[12px] hover:bg-paper-2">
          {t("fieldsManager.showInGraph")}
        </button>
      )}
    </div>
  );
}
