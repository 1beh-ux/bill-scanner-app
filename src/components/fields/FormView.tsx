"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "@/lib/i18n";
import { ChoiceSettingsEditor, NewFieldForm, slugKey } from "./FieldEditors";
import type { FmOverview } from "./types";
import type { FieldLink, FormRow, FormStructure } from "@/lib/form-structure";
import { GUARDIAN_FIELD_TYPES } from "@/lib/guardian-fields";

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
  const [creatingGuardian, setCreatingGuardian] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
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
    if (!res?.ok) {
      const code = ((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error;
      const k = `fieldsManager.err.${code}`;
      setError(code && t(k) !== k ? t(k) : t("fieldsManager.saveFailed"));
      return false;
    }
    setData(await res.json());
    onChanged();
    return true;
  };
  const change = (key: string, c: Record<string, unknown>) => patch({ key, change: c });
  // Drag & drop of questions within Osoba / Otázky: the place's question keys in the new order.
  const drop = (sectionId: string, rows: FormRow[], targetKey: string) => {
    const place = sectionId === "person" ? "person" : "questions";
    const keys = rows.filter((r): r is Extract<FormRow, { kind: "question" }> => r.kind === "question").map((r) => r.key);
    if (!dragKey || dragKey === targetKey) return;
    const next = keys.filter((k) => k !== dragKey);
    next.splice(Math.max(0, next.indexOf(targetKey)), 0, dragKey);
    setDragKey(null);
    void patch({ order: { place, keys: next } });
  };
  const fieldHref = (f: FieldLink) => (f.key.startsWith("guardian") ? null : `/fields?event=${encodeURIComponent(eventId)}&tab=data&node=${encodeURIComponent(`field:${f.key}`)}`);

  if (!data) return <p className="text-[13px] text-ink-secondary">{error ?? t("fieldsManager.loading")}</p>;
  const ticket = data.event.kind === "public_event";
  const visible = (r: FormRow) => {
    if (preview === "all") return true;
    if (r.kind === "question") return !r.cfg.audience || r.cfg.audience === "both" || r.cfg.audience === (preview === "child" ? "children" : "adults");
    if (r.kind === "text" && r.note === "jen dospělý") return preview === "adult";
    if (r.kind === "text" && r.note === "u dětí") return preview === "child";
    if (r.kind === "guardian") return preview !== "adult";
    return true;
  };
  const rows = data.sections.flatMap((s) => s.rows);
  const sel = rows.find((r) => r.id === selected) ?? data.other.find((r) => r.id === selected) ?? null;
  const draggable = (sectionId: string, r: FormRow) => r.kind === "question" && (sectionId === "person" || sectionId === "questions") && !ticket;

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
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelected(r.id)}
                    draggable={draggable(s.id, r)}
                    onDragStart={() => r.kind === "question" && setDragKey(r.key)}
                    onDragOver={(e) => draggable(s.id, r) && dragKey && e.preventDefault()}
                    onDrop={() => r.kind === "question" && drop(s.id, s.rows, r.key)}
                    className={`flex w-full flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 text-left hover:bg-paper-2 ${selected === r.id ? "border-ember bg-paper-2" : "border-transparent"} ${r.kind === "guardian" && !r.ask ? "opacity-50" : ""}`}
                  >
                    {draggable(s.id, r) && <span aria-hidden className="cursor-grab text-ink-secondary" title={t("fieldsManager.form.drag")}>⠿</span>}
                    <span className="min-w-0 flex-1">
                      {(r.kind === "text" || r.kind === "info" || (r.kind === "guardian" && r.fixed)) && <span aria-hidden>🔒 </span>}
                      {r.label}
                      {((r.kind === "text" && r.required) || (r.kind === "question" && r.cfg.required) || (r.kind === "guardian" && r.ask && r.required)) && <span className="text-ember"> *</span>}
                      {r.kind === "question" && r.cfg.hint && <span className="block text-[12px] text-ink-secondary">{r.cfg.hint}</span>}
                      {r.kind === "guardian" && r.hint && <span className="block text-[12px] text-ink-secondary">{r.hint}</span>}
                      {"field" in r && r.field && (
                        <span className="block font-mono text-[11px] text-ink-secondary">
                          → {r.field.label} <span className="opacity-70">({r.field.key})</span>
                        </span>
                      )}
                    </span>
                    <span className="flex flex-wrap justify-end gap-1">
                      {chips(r, t).map((c) => (
                        <span key={c} className="rounded-full border border-mist px-2 py-0.5 text-[11px] text-ink-secondary">{c}</span>
                      ))}
                    </span>
                  </button>
                ))}
                {s.id === "guardians" && !ticket && (
                  creatingGuardian ? (
                    <NewGuardianField onCancel={() => setCreatingGuardian(false)} onSave={async (def) => { if (await patch({ guardianField: { action: "create", ...def } })) { setCreatingGuardian(false); setSelected(`g:${def.key}`); } }} />
                  ) : (
                    <button type="button" onClick={() => setCreatingGuardian(true)} className="mt-1 rounded-lg border border-dashed border-ember/60 px-3 py-1 hover:bg-paper-2">+ {t("fieldsManager.form.newGuardianField")}</button>
                  )
                )}
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
          {sel ? (
            <RowEditor
              key={sel.id + JSON.stringify(sel)}
              row={sel}
              data={data}
              ticket={ticket}
              fieldHref={fieldHref}
              onChange={change}
              onText={(scope, key, value) => patch({ text: { scope, key, value } })}
              onPatch={patch}
            />
          ) : (
            <p className="rounded-xl border border-mist bg-paper p-4 text-ink-secondary">{t("fieldsManager.form.pick")}</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function chips(r: FormRow, t: (k: string) => string): string[] {
  if (r.kind === "text") return [t("fieldsManager.form.chip.system"), ...(r.note ? [r.note] : [])];
  if (r.kind === "info") return r.note ? [r.note] : [];
  if (r.kind === "guardian") return [t("fieldsManager.form.chip.eachGuardian"), ...(!r.ask ? [t("fieldsManager.form.chip.notAsked")] : []), ...(r.ask && r.required !== r.requiredDefault ? [t("fieldsManager.form.chip.differs")] : [])];
  const out: string[] = [];
  if (r.origin === "calculated") out.push(t("fieldsManager.form.chip.calc"));
  else if (r.origin === "event") out.push(t("fieldsManager.form.chip.eventOnly"));
  else out.push(t(r.profile ? "fieldsManager.form.chip.profile" : "fieldsManager.form.chip.registration"));
  if (r.cfg.audience === "children") out.push(t("fieldsManager.form.chip.children"));
  if (r.cfg.audience === "adults") out.push(t("fieldsManager.form.chip.adults"));
  if (r.cfg.when === "after") out.push(t("fieldsManager.form.chip.after"));
  if (r.requiredDefault !== null && r.cfg.ask && r.cfg.required !== r.requiredDefault) out.push(t("fieldsManager.form.chip.differs"));
  return out;
}

type Patch = (body: object) => Promise<boolean>;

/** "Plní pole …": which field a row fills -- always shown, also under the form's own wording. */
function Connection({ field, href }: { field?: FieldLink; href: string | null }) {
  const { t } = useTranslations();
  if (!field) return null;
  return (
    <p className="rounded-lg bg-paper-2 px-2 py-1 text-[12px]">
      {t("fieldsManager.form.fills")}{" "}
      {href ? (
        <Link href={href} className="font-medium text-ember hover:underline">{field.label}</Link>
      ) : (
        <span className="font-medium">{field.label}</span>
      )}{" "}
      <span className="font-mono text-ink-secondary">{`{{${field.key}}}`}</span>
    </p>
  );
}

/** Povinné here + the organization's default, with "differs" and a way back. */
function RequiredSwitches({ required, requiredDefault, onEvent, onOrg }: { required: boolean; requiredDefault: boolean; onEvent: (v: boolean) => void; onOrg: (v: boolean) => void }) {
  const { t } = useTranslations();
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={required} onChange={(e) => onEvent(e.target.checked)} /> {t("fieldsManager.form.requiredHere")}
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={requiredDefault} onChange={(e) => onOrg(e.target.checked)} /> {t("fieldsManager.form.requiredOrg")}
      </label>
      {required !== requiredDefault && (
        <p className="text-[12px] text-amber-800">
          {t("fieldsManager.form.differs")}{" "}
          <button type="button" onClick={() => onEvent(requiredDefault)} className="underline">{t("fieldsManager.form.backToOrg")}</button>
        </p>
      )}
      <p className="text-[11.5px] text-ink-secondary">{t("fieldsManager.form.requiredOrgHint")}</p>
    </div>
  );
}

function RowEditor({ row, data, ticket, fieldHref, onChange, onText, onPatch }: { row: FormRow; data: FormStructure; ticket: boolean; fieldHref: (f: FieldLink) => string | null; onChange: (key: string, c: Record<string, unknown>) => void; onText: (scope: "public" | "ticket", key: string, value: string) => void; onPatch: Patch }) {
  const { t } = useTranslations();
  const [label, setLabel] = useState(row.kind === "question" ? (row.cfg.label ?? "") : row.kind === "guardian" ? (row.label !== row.name ? row.label : "") : row.label);
  const [hint, setHint] = useState(row.kind === "question" ? (row.cfg.hint ?? "") : row.kind === "guardian" ? (row.hint ?? "") : "");
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
        <Connection field={row.field} href={row.field ? fieldHref(row.field) : null} />
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
  if (row.kind === "guardian") return <GuardianEditor row={row} onPatch={onPatch} label={label} setLabel={setLabel} hint={hint} setHint={setHint} />;
  const q = row;
  return (
    <div className={box}>
      <div>
        <h3 className="text-[15px] font-semibold">{q.label}</h3>
        <p className="text-[12px] text-ink-secondary">{t(q.origin === "org" ? "fieldsManager.form.originOrg" : q.origin === "calculated" ? "fieldsManager.form.originCalc" : "fieldsManager.form.originEvent")}</p>
      </div>
      <Connection field={q.field} href={fieldHref(q.field)} />
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
          {q.origin !== "calculated" &&
            (q.requiredDefault !== null && !ticket ? (
              <RequiredSwitches required={q.cfg.required} requiredDefault={q.requiredDefault} onEvent={(v) => onChange(q.key, { required: v })} onOrg={(v) => void onPatch({ key: q.key, requiredDefault: v })} />
            ) : (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={q.cfg.required} onChange={(e) => onChange(q.key, { required: e.target.checked })} /> {t("fieldsManager.required")}
              </label>
            ))}
          {!ticket && (
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-ink-secondary">{t("fieldsManager.form.place")}</span>
                <select value={q.cfg.place ?? "questions"} onChange={(e) => onChange(q.key, { place: e.target.value, order: null })} className={input}>
                  <option value="person">{t("fieldsManager.form.place.person")}</option>
                  <option value="questions">{t("fieldsManager.form.place.questions")}</option>
                </select>
              </label>
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

const choiceTypes = (type: string) => type === "select" || type === "multi";

/** A guardian question: this event (ask / required / wording / hint) and, for an own field, the field itself. */
function GuardianEditor({ row, onPatch, label, setLabel, hint, setHint }: { row: Extract<FormRow, { kind: "guardian" }>; onPatch: Patch; label: string; setLabel: (v: string) => void; hint: string; setHint: (v: string) => void }) {
  const { t } = useTranslations();
  const [name, setName] = useState(row.name);
  const [type, setType] = useState(row.fieldType);
  const [options, setOptions] = useState((row.options ?? []).join("\n"));
  const savedSet = row.settings ?? { prefill: false, docFormat: "text" as const };
  const [choiceSet, setChoiceSet] = useState(savedSet);
  const yesNo = type === "boolean" || type === "consent";
  const g = (change: Record<string, unknown>) => void onPatch({ guardian: { key: row.key, change } });
  const box = "space-y-3 rounded-xl border border-mist bg-paper p-4 text-[13px]";
  return (
    <div className={box}>
      <div>
        <h3 className="text-[15px] font-semibold">{row.fixed && "🔒 "}{row.label}</h3>
        <p className="text-[12px] text-ink-secondary">{t("fieldsManager.form.guardianHelp")}</p>
      </div>
      <Connection field={row.field} href={null} />
      {!row.fixed && !row.ask ? (
        <>
          <p className="text-ink-secondary">{t("fieldsManager.form.notAsked")}</p>
          <button type="button" onClick={() => g({ ask: true })} className="rounded-lg bg-ember px-3 py-1 text-white">{t("fieldsManager.form.ask")}</button>
        </>
      ) : (
        <>
          <label className="block space-y-1">
            <span className="text-ink-secondary">{t("fieldsManager.form.wording")}</span>
            <input value={label} placeholder={row.name} onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== (row.label !== row.name ? row.label : "") && g({ label })} className={input} />
          </label>
          <label className="block space-y-1">
            <span className="text-ink-secondary">{t("fieldsManager.form.hint")}</span>
            <input value={hint} onChange={(e) => setHint(e.target.value)} onBlur={() => hint !== (row.hint ?? "") && g({ hint })} className={input} />
          </label>
          <RequiredSwitches required={row.required} requiredDefault={row.requiredDefault} onEvent={(v) => g({ required: v })} onOrg={(v) => void onPatch({ guardian: { key: row.key, requiredDefault: v } })} />
          {!row.fixed && <button type="button" onClick={() => g({ ask: false })} className="rounded-lg border border-mist px-3 py-1 text-red-700 hover:bg-paper-2">{t("fieldsManager.form.dontAsk")}</button>}
        </>
      )}
      {!row.fixed && (
        <div className="space-y-2 border-t border-mist pt-2">
          <h4 className="font-semibold">{t("fieldsManager.form.guardianFieldOrg")}</h4>
          <label className="block space-y-1">
            <span className="text-ink-secondary">{t("fieldsManager.label")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
          </label>
          <TypePicker value={type} onChange={setType} />
          {choiceTypes(type) && (
            <label className="block space-y-1">
              <span className="text-ink-secondary">{t("fieldsManager.optionsOnePerLine")}</span>
              <textarea rows={4} value={options} onChange={(e) => setOptions(e.target.value)} className={input} />
            </label>
          )}
          {yesNo && <ChoiceSettingsEditor value={choiceSet} onChange={setChoiceSet} />}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={name === row.name && type === row.fieldType && options === (row.options ?? []).join("\n") && JSON.stringify(choiceSet) === JSON.stringify(savedSet)}
              onClick={() => void onPatch({ guardianField: { action: "update", key: row.key, label: name, fieldType: type, ...(choiceTypes(type) && { options: options.split("\n") }), ...(yesNo && { settings: choiceSet }) } })}
              className="rounded border border-mist px-2 py-1 hover:bg-paper-2 disabled:opacity-40"
            >
              {t("fieldsManager.save")}
            </button>
            <button type="button" onClick={() => confirm(t("fieldsManager.form.guardianDeleteConfirm")) && void onPatch({ guardianField: { action: "delete", key: row.key } })} className="ml-auto rounded border border-mist px-2 py-1 text-red-700 hover:bg-paper-2">
              {t("fieldsManager.form.guardianDelete")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TypePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslations();
  return (
    <div className="flex flex-wrap gap-1">
      {GUARDIAN_FIELD_TYPES.map((x) => (
        <button key={x} type="button" onClick={() => onChange(x)} className={`rounded-lg border px-2 py-1 text-[12px] ${value === x ? "border-ember bg-paper-2" : "border-mist"}`}>
          {t(`fieldsManager.type.${x}`)}
        </button>
      ))}
    </div>
  );
}

/** "+ Nové pole zástupce": a field every guardian gets (e.g. Souhlas), for the whole organization. */
function NewGuardianField({ onSave, onCancel }: { onSave: (def: { key: string; label: string; fieldType: string; options?: string[]; settings?: object; required: boolean }) => void; onCancel: () => void }) {
  const { t } = useTranslations();
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [touched, setTouched] = useState(false);
  const [type, setType] = useState("text");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);
  const [choiceSet, setChoiceSet] = useState<{ prefill: boolean; docFormat: "text" | "crossed" }>({ prefill: false, docFormat: "text" });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ key, label, fieldType: type, ...(choiceTypes(type) && { options: options.split("\n") }), ...((type === "boolean" || type === "consent") && { settings: choiceSet }), required });
      }}
      className="mt-2 space-y-2 rounded-xl border border-ember/50 bg-paper p-3"
    >
      <h4 className="font-semibold">{t("fieldsManager.form.newGuardianField")}</h4>
      <p className="text-[12px] text-ink-secondary">{t("fieldsManager.form.newGuardianFieldHint")}</p>
      <label className="block">
        {t("fieldsManager.label")}
        <input required value={label} onChange={(e) => (setLabel(e.target.value), !touched && setKey(slugKey(e.target.value).toLowerCase()))} className={input} />
      </label>
      <label className="block">
        {t("fieldsManager.key")}
        <input required pattern="[a-z][a-z0-9_]*" value={key} onChange={(e) => (setKey(e.target.value), setTouched(true))} className={`${input} font-mono`} />
        <span className="text-[11.5px] text-ink-secondary">{`{{guardian1_${key || "…"}}}, {{guardian2_${key || "…"}}}`}</span>
      </label>
      <TypePicker value={type} onChange={setType} />
      {choiceTypes(type) && (
        <label className="block">
          {t("fieldsManager.optionsOnePerLine")}
          <textarea required rows={4} value={options} onChange={(e) => setOptions(e.target.value)} className={input} />
        </label>
      )}
      {(type === "boolean" || type === "consent") && <ChoiceSettingsEditor value={choiceSet} onChange={setChoiceSet} />}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> {t("fieldsManager.form.requiredOrg")}
      </label>
      <div className="flex gap-2">
        <button type="submit" className="rounded-lg bg-ember px-3 py-1 text-white">{t("fieldsManager.save")}</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-mist px-3 py-1">{t("fieldsManager.cancel")}</button>
      </div>
    </form>
  );
}
