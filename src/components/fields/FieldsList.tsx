"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import FieldCard from "./FieldCard";
import { NewFieldForm } from "./FieldEditors";
import type { FmDocTemplate, FmOverview } from "./types";

// Suggested free variables (questions Q14), offered as one-click keys.
const SUGGESTED = [
  { key: "leader_name", labelKey: "fieldsManager.var.leader_name" },
  { key: "contact_phone", labelKey: "fieldsManager.var.contact_phone" },
  { key: "payment_deadline", labelKey: "fieldsManager.var.payment_deadline" },
];

// Fields (prompt screens 04–05, read-only in phase 2): every field by group plus the event variables, with search;
// the selected one's details on the right. Editing arrives in phase 3.
export default function FieldsList({ overview, docs, selectedKey, onSelectKey, onShowInGraph, onChanged }: { overview: FmOverview; docs: FmDocTemplate[] | null; selectedKey: string | null; onSelectKey: (k: string) => void; onShowInGraph: (k: string) => void; onChanged: () => void }) {
  const { t } = useTranslations();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<{ key: string; label: string; value: string } | null>(null);
  const [varError, setVarError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renamed, setRenamed] = useState<{ from: string; to: string; logId: string } | null>(null);
  async function undoRename() {
    if (!renamed) return;
    const res = await fetch("/api/fields/undo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logId: renamed.logId }) }).catch(() => null);
    if (!res?.ok) return setVarError(t("fieldsManager.undoFailed"));
    onSelectKey(renamed.from);
    setRenamed(null);
    onChanged();
  }
  // Free event variables (phase 3a): this event's value; built-in and linked ones are edited where they live today.
  async function saveVariable(body: { key: string; label?: string; value: string }, method: "PUT" | "DELETE" = "PUT") {
    setVarError(null);
    const res = await fetch("/api/fields/variables", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: overview.eventId, ...body }) }).catch(() => null);
    if (!res?.ok) {
      const code = res ? ((await res.json().catch(() => ({}))) as { error?: string }).error : null;
      return setVarError(t(code === "key_taken" ? "fieldsManager.keyTaken" : code === "invalid_key" ? "fieldsManager.invalidKey" : "fieldsManager.saveFailed"));
    }
    setDraft(null);
    onChanged();
  }
  const needle = q.trim().toLocaleLowerCase("cs");
  const match = (label: string, key: string) => !needle || label.toLocaleLowerCase("cs").includes(needle) || key.toLowerCase().includes(needle);
  const field = overview.fields.find((f) => f.key === selectedKey) ?? null;
  const variable = useMemo(() => overview.variables.find((v) => v.key === selectedKey) ?? null, [overview.variables, selectedKey]);
  const row = (active: boolean) => `flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-paper-2 ${active ? "bg-paper-2 font-medium" : ""}`;

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(240px,1fr)_minmax(300px,1.4fr)]">
      <div className="rounded-xl border border-mist bg-paper p-3">
        <div className="mb-2 flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("fieldsManager.search")} className="min-w-0 flex-1 rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px]" />
          <button type="button" onClick={() => setCreating(true)} className="shrink-0 rounded-lg bg-ember px-3 py-1.5 text-[13px] text-white">+ {t("fieldsManager.newField")}</button>
        </div>
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
            <h3 className="flex items-center justify-between px-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">
              {t("fieldsManager.eventVariables")}
              <button type="button" onClick={() => setDraft(draft ? null : { key: "", label: "", value: "" })} className="normal-case tracking-normal text-ember hover:underline">
                + {t("fieldsManager.addVariable")}
              </button>
            </h3>
            {draft && (
              <form
                className="m-2 space-y-1 rounded-lg border border-mist p-2 text-[12px]"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveVariable(draft);
                }}
              >
                <div className="flex flex-wrap gap-1">
                  {SUGGESTED.filter((v) => !overview.variables.some((x) => x.key === v.key)).map((v) => (
                    <button key={v.key} type="button" onClick={() => setDraft({ ...draft, key: v.key, label: t(v.labelKey) })} className="rounded-full border border-mist px-2 py-0.5 hover:bg-paper-2">
                      {t(v.labelKey)}
                    </button>
                  ))}
                </div>
                <input required value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder={t("fieldsManager.variableLabel")} className="w-full rounded border border-mist bg-paper px-2 py-0.5" />
                <input required pattern="[a-z][a-z0-9_]{1,39}" value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} placeholder="klic_promenne" className="w-full rounded border border-mist bg-paper px-2 py-0.5 font-mono" />
                <input value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} placeholder={t("fieldsManager.valueHere")} className="w-full rounded border border-mist bg-paper px-2 py-0.5" />
                <button className="rounded bg-ember px-2 py-0.5 text-white">{t("fieldsManager.save")}</button>
                {varError && <p className="text-red-700">{varError}</p>}
              </form>
            )}
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
      <div className="space-y-3">
        {renamed && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-pine bg-pine-bg px-3 py-2 text-[13px]">
            <span>{t("fieldsManager.renamedTo", { from: renamed.from, to: renamed.to })}</span>
            <button type="button" onClick={undoRename} className="rounded border border-pine px-2 py-0.5 text-[12px]">{t("fieldsManager.undo")}</button>
          </div>
        )}
        {creating && (
          <NewFieldForm
            overview={overview}
            onDone={(k) => {
              setCreating(false);
              if (k) {
                onSelectKey(k);
                onChanged();
              }
            }}
          />
        )}
        {field && !creating && (
          <FieldCard
            field={field}
            overview={overview}
            docs={docs}
            onShowInGraph={() => onShowInGraph(field.key)}
            onChanged={onChanged}
            onRenamed={(from, to, logId) => {
              setRenamed({ from, to, logId });
              onSelectKey(to);
              onChanged();
            }}
          />
        )}
        {variable && (
          <div className="rounded-xl border border-mist bg-paper p-4 text-[13px]">
            <h3 className="text-[15px] font-semibold text-ink">{variable.label}</h3>
            <div className="mt-0.5 font-mono text-[12px] text-ink-secondary">{`{{${variable.key}}}`}</div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
              <dt className="text-ink-secondary">{t("fieldsManager.variableKind")}</dt>
              <dd>{t(`fieldsManager.variableKind.${variable.kind}`)}</dd>
              <dt className="text-ink-secondary">{t("fieldsManager.valueHere")}</dt>
              <dd>
                {variable.kind === "free" ? (
                  <form
                    className="flex gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveVariable({ key: variable.key, value: String(new FormData(e.currentTarget).get("value") ?? "") });
                    }}
                  >
                    <input key={variable.key + variable.value} name="value" defaultValue={variable.value ?? ""} className="min-w-0 flex-1 rounded border border-mist bg-paper px-2 py-0.5" />
                    <button className="rounded border border-mist px-2 text-[12px] hover:bg-paper-2">{t("fieldsManager.save")}</button>
                  </form>
                ) : variable.value === null ? (
                  <span className="text-ink-secondary">{t("fieldsManager.perParticipant")}</span>
                ) : (
                  variable.value || "—"
                )}
              </dd>
              <dt className="text-ink-secondary">{t("fieldsManager.enteredIn")}</dt>
              <dd className="text-ink-secondary">{variable.source}</dd>
              {variable.aliases.length > 0 && (
                <>
                  <dt className="text-ink-secondary">{t("fieldsManager.aliases")}</dt>
                  <dd className="font-mono">{variable.aliases.join(", ")}</dd>
                </>
              )}
            </dl>
            {variable.kind === "free" && (
              <button type="button" onClick={() => saveVariable({ key: variable.key, value: "" }, "DELETE")} className="mt-3 rounded-lg border border-mist px-2.5 py-1 text-[12px] text-red-700 hover:bg-paper-2">
                {t("fieldsManager.deleteVariable")}
              </button>
            )}
            {varError && <p className="mt-2 text-[12px] text-red-700">{varError}</p>}
          </div>
        )}
        {!field && !variable && <p className="p-4 text-[13px] text-ink-secondary">{t("fieldsManager.pickField")}</p>}
      </div>
    </div>
  );
}
