"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import FieldCard from "./FieldCard";
import type { FmDocTemplate, FmOverview } from "./types";

// Fields (prompt screens 04–05, read-only in phase 2): every field by group plus the event variables, with search;
// the selected one's details on the right. Editing arrives in phase 3.
export default function FieldsList({ overview, docs, selectedKey, onSelectKey, onShowInGraph }: { overview: FmOverview; docs: FmDocTemplate[] | null; selectedKey: string | null; onSelectKey: (k: string) => void; onShowInGraph: (k: string) => void }) {
  const { t } = useTranslations();
  const [q, setQ] = useState("");
  const needle = q.trim().toLocaleLowerCase("cs");
  const match = (label: string, key: string) => !needle || label.toLocaleLowerCase("cs").includes(needle) || key.toLowerCase().includes(needle);
  const field = overview.fields.find((f) => f.key === selectedKey) ?? null;
  const variable = useMemo(() => overview.variables.find((v) => v.key === selectedKey) ?? null, [overview.variables, selectedKey]);
  const row = (active: boolean) => `flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-paper-2 ${active ? "bg-paper-2 font-medium" : ""}`;

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(240px,1fr)_minmax(300px,1.4fr)]">
      <div className="rounded-xl border border-mist bg-paper p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("fieldsManager.search")} className="mb-2 w-full rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px]" />
        <div className="max-h-[70vh] space-y-3 overflow-auto">
          {overview.groups.map((g) => {
            const list = overview.fields.filter((f) => f.group === g.id && match(f.label, f.key));
            if (!list.length) return null;
            return (
              <div key={g.id}>
                <h3 className="px-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">{g.label ?? t(g.labelKey ?? "")}</h3>
                {list.map((f) => (
                  <button key={f.key} type="button" onClick={() => onSelectKey(f.key)} className={row(f.key === selectedKey)}>
                    <span className={`truncate ${f.calculated ? "underline decoration-ember decoration-dashed underline-offset-4" : ""}`}>{f.label}</span>
                    <span className="shrink-0 font-mono text-[11px] text-ink-secondary">{f.key}</span>
                  </button>
                ))}
              </div>
            );
          })}
          <div>
            <h3 className="px-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">{t("fieldsManager.eventVariables")}</h3>
            {overview.variables
              .filter((v) => match(v.label, v.key))
              .map((v) => (
                <button key={v.key} type="button" onClick={() => onSelectKey(v.key)} className={row(v.key === selectedKey)}>
                  <span className="truncate">{v.label}</span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-secondary">{v.key}</span>
                </button>
              ))}
          </div>
        </div>
      </div>
      <div>
        {field && <FieldCard field={field} overview={overview} docs={docs} onShowInGraph={() => onShowInGraph(field.key)} />}
        {variable && (
          <div className="rounded-xl border border-mist bg-paper p-4 text-[13px]">
            <h3 className="text-[15px] font-semibold text-ink">{variable.label}</h3>
            <div className="mt-0.5 font-mono text-[12px] text-ink-secondary">{`{{${variable.key}}}`}</div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
              <dt className="text-ink-secondary">{t("fieldsManager.variableKind")}</dt>
              <dd>{t(`fieldsManager.variableKind.${variable.kind}`)}</dd>
              <dt className="text-ink-secondary">{t("fieldsManager.valueHere")}</dt>
              <dd>{variable.value === null ? <span className="text-ink-secondary">{t("fieldsManager.perParticipant")}</span> : variable.value || "—"}</dd>
              <dt className="text-ink-secondary">{t("fieldsManager.enteredIn")}</dt>
              <dd className="text-ink-secondary">{variable.source}</dd>
              {variable.aliases.length > 0 && (
                <>
                  <dt className="text-ink-secondary">{t("fieldsManager.aliases")}</dt>
                  <dd className="font-mono">{variable.aliases.join(", ")}</dd>
                </>
              )}
            </dl>
          </div>
        )}
        {!field && !variable && <p className="p-4 text-[13px] text-ink-secondary">{t("fieldsManager.pickField")}</p>}
      </div>
    </div>
  );
}
