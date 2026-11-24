"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "@/lib/i18n";
import { NewFieldForm } from "./FieldEditors";
import type { FmOverview } from "./types";
import type { FormRow, FormStructure } from "@/lib/form-structure";

// Pole -> Formulář (rethink 2026-11-24): the event's registration (or ticket) form as the applicant sees it, top to
// bottom and in the same words. Click a row to change it on the right; add another question below. Every change is
// saved at once; "Vrátit na pravidla podle portálu" puts the whole event back on today's rules.
const input = "w-full rounded-lg border border-mist bg-paper px-2.5 py-1.5 text-[13px]";

export default function FormView({ eventId, overview, onChanged }: { eventId: string; overview: FmOverview; onChanged: () => void }) {
  const { t } = useTranslations();
  const [data, setData] = useState<FormStructure | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<"all" | "child" | "adult">("all");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/fields/form?event=${encodeURIComponent(eventId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(t("fieldsManager.loadFailed")));
  }, [eventId, t]);
  useEffect(load, [load]);

  const patch = async (body: object) => {
    setError(null);
    const res = await fetch("/api/fields/form", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: eventId, ...body }) }).catch(() => null);
    if (!res?.ok) return setError(t("fieldsManager.saveFailed"));
    setData(await res.json());
    onChanged();
  };
  const change = (key: string, c: Record<string, unknown>) => patch({ key, change: c });

  if (!data) return <p className="text-[13px] text-ink-secondary">{error ?? t("fieldsManager.loading")}</p>;
  const ticket = data.event.kind === "public_event";
  const visible = (r: FormRow) => {
    if (preview === "all") return true;
    if (r.kind === "question") return !r.cfg.audience || r.cfg.audience === "both" || r.cfg.audience === (preview === "child" ? "children" : "adults");
    if (r.kind === "text" && r.note === "jen dospělý") return preview === "adult";
    if (r.kind === "text" && r.note === "u dětí") return preview === "child";
    return true;
  };
  const rows = data.sections.flatMap((s) => s.rows);
  const sel = rows.find((r) => r.id === selected) ?? data.other.find((r) => r.id === selected) ?? null;

  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-ink-secondary">{t(ticket ? "fieldsManager.form.introTicket" : "fieldsManager.form.intro")}</p>
        {!ticket && (
          <div role="group" aria-label={t("fieldsManager.form.previewAs")} className="ml-auto flex overflow-hidden rounded-lg border border-mist">
            {(["all", "child", "adult"] as const).map((p) => (
              <button key={p} type="button" onClick={() => setPreview(p)} className={`px-3 py-1.5 ${preview === p ? "bg-ink text-paper" : "bg-paper"}`}>
                {t(`fieldsManager.form.preview.${p}`)}
              </button>
            ))}
          </div>
        )}
        {data.event.slug && (
          <a href={`/r/${data.event.slug}`} target="_blank" rel="noreferrer" className="font-medium text-ember hover:underline">
            {t("fieldsManager.form.open")} ↗
          </a>
        )}
      </div>
      {error && <p className="text-red-700">{error}</p>}
      {!data.event.publicRegistration && !ticket && <p className="rounded-lg bg-amber-50 p-2 text-amber-900">{t("fieldsManager.form.noPublic")}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {data.sections.map((s) => {
            const shown = s.rows.filter(visible);
            if (!shown.length && s.id !== "questions") return null;
            return (
              <section key={s.id} className="rounded-xl border border-mist bg-paper p-3">
                <h3 className="mb-1 text-[14px] font-semibold">{s.title}</h3>
                {shown.length === 0 && <p className="text-ink-secondary">{t("fieldsManager.form.noQuestions")}</p>}
                {shown.map((r) => (
                  <button key={r.id} type="button" onClick={() => setSelected(r.id)} className={`flex w-full flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 text-left hover:bg-paper-2 ${selected === r.id ? "border-ember bg-paper-2" : "border-transparent"}`}>
                    <span className="min-w-0 flex-1">
                      {r.kind !== "question" && <span aria-hidden>🔒 </span>}
                      {r.label}
                      {((r.kind === "text" && r.required) || (r.kind === "question" && r.cfg.required)) && <span className="text-ember"> *</span>}
                      {r.kind === "question" && r.cfg.hint && <span className="block text-[12px] text-ink-secondary">{r.cfg.hint}</span>}
                    </span>
                    <span className="flex flex-wrap justify-end gap-1">
                      {chips(r, t).map((c) => (
                        <span key={c} className="rounded-full border border-mist px-2 py-0.5 text-[11px] text-ink-secondary">{c}</span>
                      ))}
                    </span>
                  </button>
                ))}
              </section>
            );
          })}

          <section className="space-y-2 rounded-xl border border-dashed border-mist p-3">
            <h3 className="text-[14px] font-semibold">{t("fieldsManager.form.more")}</h3>
            <div className="flex flex-wrap gap-1.5">
              {data.other.map((q) => (
                <button key={q.id} type="button" onClick={() => change(q.key, { ask: true })} className={`rounded-full border px-2.5 py-1 hover:bg-paper-2 ${q.origin === "calculated" ? "border-dashed border-ember/60" : "border-mist"}`} title={q.key}>
                  + {q.name}
                </button>
              ))}
              {data.other.length === 0 && <span className="text-ink-secondary">{t("fieldsManager.form.nothingMore")}</span>}
            </div>
            {creating ? (
              <NewFieldForm
                overview={overview}
                onDone={(k) => {
                  setCreating(false);
                  if (k) change(k, { ask: true });
                }}
              />
            ) : (
              <button type="button" onClick={() => setCreating(true)} className="rounded-lg bg-ember px-3 py-1.5 text-white">+ {t("fieldsManager.form.newQuestion")}</button>
            )}
          </section>

          {data.converted && (
            <button
              type="button"
              onClick={() => confirm(t("fieldsManager.form.resetConfirm")) && patch({ reset: true })}
              className="text-[12px] text-ink-secondary underline"
            >
              {t("fieldsManager.form.reset")}
            </button>
          )}
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          {sel ? <RowEditor key={sel.id + JSON.stringify(sel)} row={sel} data={data} ticket={ticket} onChange={change} onText={(scope, key, value) => patch({ text: { scope, key, value } })} /> : <p className="rounded-xl border border-mist bg-paper p-4 text-ink-secondary">{t("fieldsManager.form.pick")}</p>}
        </aside>
      </div>
    </div>
  );
}

function chips(r: FormRow, t: (k: string) => string): string[] {
  if (r.kind === "text") return [t("fieldsManager.form.chip.system"), ...(r.note ? [r.note] : [])];
  if (r.kind === "info") return r.note ? [r.note] : [];
  const out: string[] = [];
  if (r.origin === "calculated") out.push(t("fieldsManager.form.chip.calc"));
  else if (r.origin === "event") out.push(t("fieldsManager.form.chip.eventOnly"));
  else out.push(t(r.profile ? "fieldsManager.form.chip.profile" : "fieldsManager.form.chip.registration"));
  if (r.cfg.audience === "children") out.push(t("fieldsManager.form.chip.children"));
  if (r.cfg.audience === "adults") out.push(t("fieldsManager.form.chip.adults"));
  if (r.cfg.when === "after") out.push(t("fieldsManager.form.chip.after"));
  if (r.label !== r.name) out.push(r.name);
  return out;
}

function RowEditor({ row, data, ticket, onChange, onText }: { row: FormRow; data: FormStructure; ticket: boolean; onChange: (key: string, c: Record<string, unknown>) => void; onText: (scope: "public" | "ticket", key: string, value: string) => void }) {
  const { t } = useTranslations();
  const [label, setLabel] = useState(row.kind === "question" ? (row.cfg.label ?? "") : row.label);
  const [hint, setHint] = useState(row.kind === "question" ? (row.cfg.hint ?? "") : "");
  const box = "space-y-3 rounded-xl border border-mist bg-paper p-4 text-[13px]";
  if (row.kind === "info")
    return (
      <div className={box}>
        <h3 className="text-[15px] font-semibold">🔒 {row.label}</h3>
        <p className="text-ink-secondary">{row.note}</p>
        {row.href && <Link href={row.href} className="text-ember hover:underline">{t("fieldsManager.panel.changeThere")} ↗</Link>}
      </div>
    );
  if (row.kind === "text")
    return (
      <div className={box}>
        <h3 className="text-[15px] font-semibold">🔒 {row.label}</h3>
        <p className="text-ink-secondary">{t("fieldsManager.form.systemHelp")}</p>
        <label className="block space-y-1">
          <span className="text-ink-secondary">{t("fieldsManager.form.wording")}</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={input} />
        </label>
        <div className="flex gap-2">
          <button type="button" disabled={label === row.label} onClick={() => onText(row.scope, row.textKey, label)} className="rounded border border-mist px-2 py-1 hover:bg-paper-2 disabled:opacity-40">{t("fieldsManager.save")}</button>
          <button type="button" onClick={() => onText(row.scope, row.textKey, "")} className="rounded border border-mist px-2 py-1 hover:bg-paper-2">{t("fieldsManager.sentence.reset")}</button>
        </div>
        <p className="text-[12px] text-ink-secondary">{t("fieldsManager.form.thisEventOnly")}</p>
      </div>
    );
  const q = row;
  return (
    <div className={box}>
      <div>
        <h3 className="text-[15px] font-semibold">{q.label}</h3>
        <p className="text-[12px] text-ink-secondary">
          {t(q.origin === "org" ? "fieldsManager.form.originOrg" : q.origin === "calculated" ? "fieldsManager.form.originCalc" : "fieldsManager.form.originEvent")} · <span className="font-mono">{q.key}</span>
        </p>
      </div>
      {q.cfg.ask ? (
        <>
          <label className="block space-y-1">
            <span className="text-ink-secondary">{t("fieldsManager.form.wording")}</span>
            <input value={label} placeholder={q.name} onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== (q.cfg.label ?? "") && onChange(q.key, { label })} className={input} />
          </label>
          {!ticket && (
            <label className="block space-y-1">
              <span className="text-ink-secondary">{t("fieldsManager.form.hint")}</span>
              <input value={hint} onChange={(e) => setHint(e.target.value)} onBlur={() => hint !== (q.cfg.hint ?? "") && onChange(q.key, { hint })} className={input} />
            </label>
          )}
          {q.origin !== "calculated" && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={q.cfg.required} onChange={(e) => onChange(q.key, { required: e.target.checked })} /> {t("fieldsManager.required")}
            </label>
          )}
          {!ticket && (
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-ink-secondary">{t("fieldsManager.form.forWhom")}</span>
                <select value={q.cfg.audience ?? "both"} onChange={(e) => onChange(q.key, { audience: e.target.value })} className={input}>
                  {(["both", "children", "adults"] as const).map((a) => (
                    <option key={a} value={a}>{t(`fieldsManager.form.aud.${a}`)}</option>
                  ))}
                </select>
              </label>
              {data.event.detailsAfterAcceptance && (
                <label className="space-y-1">
                  <span className="text-ink-secondary">{t("fieldsManager.form.when")}</span>
                  <select value={q.cfg.when} onChange={(e) => onChange(q.key, { when: e.target.value })} className={input}>
                    <option value="registration">{t("fieldsManager.form.when.registration")}</option>
                    <option value="after">{t("fieldsManager.form.when.after")}</option>
                  </select>
                </label>
              )}
            </div>
          )}
          {q.origin === "calculated" && <p className="text-ink-secondary">{t("fieldsManager.form.calcShown")}</p>}
          <div className="space-y-1 border-t border-mist pt-2 text-[12px] text-ink-secondary">
            {q.origin === "org" && <p>{t(q.profile ? "fieldsManager.form.savesProfile" : "fieldsManager.form.savesRegistration")}</p>}
            {q.origin === "event" && <p>{t("fieldsManager.form.savesRegistration")}</p>}
            {q.inPortal && <p>{t("fieldsManager.form.inPortal")}: {t(`fieldsManager.portalAccess.${q.inPortal}`)}</p>}
          </div>
          <button type="button" onClick={() => onChange(q.key, { ask: false })} className="rounded-lg border border-mist px-3 py-1 text-red-700 hover:bg-paper-2">{t("fieldsManager.form.dontAsk")}</button>
        </>
      ) : (
        <>
          <p className="text-ink-secondary">{t("fieldsManager.form.notAsked")}</p>
          <button type="button" onClick={() => onChange(q.key, { ask: true })} className="rounded-lg bg-ember px-3 py-1 text-white">{t("fieldsManager.form.ask")}</button>
        </>
      )}
    </div>
  );
}
