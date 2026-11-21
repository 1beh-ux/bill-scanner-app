"use client";

import { useTranslations } from "@/lib/i18n";
import { docsUsing, type FmDocTemplate, type FmOverview, type UseId } from "./types";

// Where it is used (prompt screen 17, read-only in phase 2; editable in place from phase 3): every field of the
// selected event with its group, required flag (event value; organization default beside it), uses and documents.
const COLS: UseId[] = ["lists", "health", "mail", "email", "documents", "form"];

export default function UsageMatrix({ overview, docs, onSelectKey }: { overview: FmOverview; docs: FmDocTemplate[] | null; onSelectKey: (k: string) => void }) {
  const { t } = useTranslations();
  const groupLabel = (id: string) => {
    const g = overview.groups.find((x) => x.id === id);
    return g ? (g.label ?? t(g.labelKey ?? "")) : id;
  };
  const tick = (on: boolean) => <span className={on ? "text-pine" : "text-mist"}>{on ? "●" : "○"}</span>;
  const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-secondary";

  return (
    <div className="overflow-auto rounded-xl border border-mist bg-paper">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-paper-2">
          <tr>
            <th className={th}>{t("fieldsManager.field")}</th>
            <th className={th}>{t("fieldsManager.group")}</th>
            <th className={th}>{t("fieldsManager.required")}</th>
            {COLS.map((c) => (
              <th key={c} className={`${th} text-center`}>{t(`fieldsManager.use.${c}`)}</th>
            ))}
            <th className={th}>{t("fieldsManager.portal")}</th>
            <th className={th}>{t("fieldsManager.documents")}</th>
          </tr>
        </thead>
        <tbody>
          {overview.fields.map((f) => (
            <tr key={f.key} className="border-t border-mist">
              <td className="px-2 py-1.5">
                <button type="button" onClick={() => onSelectKey(f.key)} className={`text-left hover:underline ${f.calculated ? "decoration-dashed" : ""}`}>
                  {f.label}
                </button>
                <div className="font-mono text-[11px] text-ink-secondary">{f.key}</div>
              </td>
              <td className="px-2 py-1.5 text-ink-secondary">{groupLabel(f.group)}</td>
              <td className="px-2 py-1.5">
                {f.calculated ? "—" : tick(f.required)}
                {f.requiredDefault !== null && f.requiredDefault !== f.required && (
                  <span className="ml-1 text-[11px] text-ink-secondary" title={t("fieldsManager.requiredDefault")}>
                    ({t("fieldsManager.defaultShort")}: {f.requiredDefault ? t("fieldsManager.yes") : t("fieldsManager.no")})
                  </span>
                )}
              </td>
              {COLS.map((c) => (
                <td key={c} className="px-2 py-1.5 text-center">{tick(f.uses.includes(c))}</td>
              ))}
              <td className="px-2 py-1.5 text-ink-secondary">{f.portalAccess ? t(`fieldsManager.portalAccess.${f.portalAccess}`) : "—"}</td>
              <td className="px-2 py-1.5 text-[12px]">{docs === null ? "…" : docsUsing(f, docs).map((d) => d.name).join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
