"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n";
import type { FmOverview } from "./types";

// Suggested free variables (questions Q14), offered as one-click keys.
const SUGGESTED = [
  { key: "leader_name", labelKey: "fieldsManager.var.leader_name" },
  { key: "contact_phone", labelKey: "fieldsManager.var.contact_phone" },
  { key: "payment_deadline", labelKey: "fieldsManager.var.payment_deadline" },
];
const CATEGORIES = ["event", "participant", "sentence", "free"] as const;

// The list view of the Fields screen (redesign R7: Přehled and Pole are one screen -- this is its left column in
// list form; the details are in the shared right panel). Fields by group, then the variables by kind (R10).
export default function FieldsList({ overview, selected, onSelect, onChanged }: { overview: FmOverview; selected: string | null; onSelect: (id: string) => void; onChanged: () => void }) {
  const { t } = useTranslations();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<{ key: string; label: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function addVariable(body: { key: string; label: string; value: string }) {
    setError(null);
    const res = await fetch("/api/fields/variables", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: overview.eventId, ...body }) }).catch(() => null);
    if (!res?.ok) {
      const code = res ? ((await res.json().catch(() => ({}))) as { error?: string }).error : null;
      return setError(t(code === "key_taken" ? "fieldsManager.keyTaken" : code === "invalid_key" ? "fieldsManager.invalidKey" : "fieldsManager.saveFailed"));
    }
    setDraft(null);
    onSelect(`var:${body.key}`);
    onChanged();
  }
  const needle = q.trim().toLocaleLowerCase("cs");
  const match = (label: string, key: string) => !needle || label.toLocaleLowerCase("cs").includes(needle) || key.toLowerCase().includes(needle);
  const row = (active: boolean) => `flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-paper-2 ${active ? "bg-paper-2 font-medium" : ""}`;
  const head = "px-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary";

  return (
    <div className="rounded-xl border border-mist bg-paper p-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("fieldsManager.search")} className="mb-2 w-full rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px]" />
      <div className="max-h-[75vh] space-y-3 overflow-auto">
        {overview.groups.map((g) => {
          const list = overview.fields.filter((f) => f.group === g.id && match(f.label, f.key));
          if (!list.length) return null;
          return (
            <div key={g.id}>
              <h3 className={head}>{g.label ?? t(g.labelKey ?? "")}</h3>
              {list.map((f) => (
                <button key={f.key} type="button" onClick={() => onSelect(`field:${f.key}`)} className={row(selected === `field:${f.key}`)}>
                  <span className={`truncate ${f.calculated ? "underline decoration-ember decoration-dashed underline-offset-4" : ""}`}>{f.label}</span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-secondary">{f.key}</span>
                </button>
              ))}
            </div>
          );
        })}
        {CATEGORIES.map((c) => {
          const list = overview.variables.filter((v) => v.category === c && match(v.label, v.key));
          if (!list.length && c !== "free") return null;
          return (
            <div key={c}>
              <h3 className={`${head} flex items-center justify-between`}>
                {t(`fieldsManager.varCategory.${c}`)}
                {c === "free" && (
                  <button type="button" onClick={() => setDraft(draft ? null : { key: "", label: "", value: "" })} className="normal-case tracking-normal text-ember hover:underline">
                    + {t("fieldsManager.addVariable")}
                  </button>
                )}
              </h3>
              {c === "free" && draft && (
                <form className="m-2 space-y-1 rounded-lg border border-mist p-2 text-[12px]" onSubmit={(e) => (e.preventDefault(), addVariable(draft))}>
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
                  {error && <p className="text-red-700">{error}</p>}
                </form>
              )}
              {list.map((v) => (
                <button key={v.key} type="button" onClick={() => onSelect(`var:${v.key}`)} className={row(selected === `var:${v.key}`)}>
                  <span className="truncate">{v.label}</span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-secondary">{v.key}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
