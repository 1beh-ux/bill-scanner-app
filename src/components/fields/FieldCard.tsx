"use client";

import { useTranslations } from "@/lib/i18n";
import { docsUsing, type FmDocTemplate, type FmOverview, type OvField } from "./types";

// The field-details card (Fields Manager phase 2, read-only): what a field is, where its values live, where it
// comes from and where it is used. Phase 2b embeds it in the roster, health, mail and documents screens.
export default function FieldCard({ field, overview, docs, onShowInGraph }: { field: OvField; overview: FmOverview; docs: FmDocTemplate[] | null; onShowInGraph?: () => void }) {
  const { t } = useTranslations();
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
        <span className={tag}>{t(`fieldsManager.storage.${field.storage}`)}</span>
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
              {field.required ? t("fieldsManager.yes") : t("fieldsManager.no")}
              <span className="text-ink-secondary"> · {t("fieldsManager.requiredDefault")}: {field.requiredDefault ? t("fieldsManager.yes") : t("fieldsManager.no")}</span>
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
      {onShowInGraph && (
        <button type="button" onClick={onShowInGraph} className="mt-3 rounded-lg border border-mist px-2.5 py-1 text-[12px] hover:bg-paper-2">
          {t("fieldsManager.showInGraph")}
        </button>
      )}
    </div>
  );
}
