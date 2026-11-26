"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { SEPARATOR_PRESETS } from "@/lib/field-calc";
import type { FmOverview, OvField } from "./types";

// Phase 3b: a new field (any type, calculated included) and renaming a key with a preview + confirmation.
const TYPES = ["text", "longtext", "number", "date", "boolean", "select", "multi", "consent", "email", "phone", "calculated"] as const;
const CALC_KINDS = ["join", "template", "age", "if", "contact"] as const;
const input = "w-full rounded border border-mist bg-paper px-2 py-1 text-[13px]";

/** Label -> a key: lowercase ASCII, digits, underscores. */
export const slugKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/^(?=[0-9_])/, "f_");

type CalcState = { kind: (typeof CALC_KINDS)[number]; parts: string[]; separator: string; text: string; source: string; then: string; else: string; test: string; adult: string; guardians: string };
const EMPTY_CALC: CalcState = { kind: "join", parts: [], separator: " ", text: "", source: "", then: "", else: "", test: "filled", adult: "auto", guardians: "first" };
/** A saved spec -> the editor's state (redesign R7: a calculated field is edited with the same editor). */
function calcState(spec: unknown): CalcState {
  const o = (spec ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const kind = (CALC_KINDS as readonly string[]).includes(str(o.kind)) ? (o.kind as CalcState["kind"]) : "join";
  const test = o.test === "yes" || o.test === "filled" ? o.test : o.test && typeof o.test === "object" ? str((o.test as { equals?: unknown }).equals) : "filled";
  return { ...EMPTY_CALC, kind, parts: Array.isArray(o.parts) ? o.parts.filter((x): x is string => typeof x === "string") : [], separator: typeof o.separator === "string" ? o.separator : " ", text: str(o.text), source: str(o.source), then: str(o.then), else: str(o.else), test, adult: typeof o.adult === "string" ? o.adult : o.kind === "contact" ? "" : "auto", guardians: str(o.guardians) || "first" };
}

/** New field, or (with `edit`) the calculation of an existing calculated field. */
export function NewFieldForm({ overview, onDone, edit, initialKey }: { overview: FmOverview; onDone: (key: string | null) => void; edit?: { key: string; spec: unknown }; initialKey?: string }) {
  const { t } = useTranslations();
  const [label, setLabel] = useState("");
  // initialKey: a document's variable the new field is made for (Dokumenty) -- kept unless changed by hand.
  const [key, setKey] = useState(initialKey ?? "");
  const [keyTouched, setKeyTouched] = useState(!!initialKey);
  const [type, setType] = useState<(typeof TYPES)[number]>(edit ? "calculated" : "text");
  const [options, setOptions] = useState("");
  const [calc, setCalc] = useState<CalcState>(edit ? calcState(edit.spec) : EMPTY_CALC);
  const [error, setError] = useState<string | null>(null);
  const keys = overview.fields.filter((f) => (f.kind !== "computed" || f.key === "Name") && f.key !== edit?.key).map((f) => f.key);

  function spec() {
    if (calc.kind === "join") return { kind: "join", parts: calc.parts, separator: calc.separator };
    if (calc.kind === "template") return { kind: "template", text: calc.text };
    if (calc.kind === "age") return { kind: "age", source: calc.source, asOf: "event_start" };
    if (calc.kind === "contact") return { kind: "contact", adult: calc.adult || null, guardians: calc.guardians };
    return { kind: "if", source: calc.source, test: calc.test === "filled" || calc.test === "yes" ? calc.test : { equals: calc.test }, then: calc.then, else: calc.else };
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (edit) {
      const res = await fetch(`/api/fields/${encodeURIComponent(edit.key)}?event=${encodeURIComponent(overview.eventId ?? "")}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ calc: spec() }) }).catch(() => null);
      if (res?.ok) return onDone(edit.key);
      const code = res ? ((await res.json().catch(() => ({}))) as { error?: string }).error : null;
      return setError(t(`fieldsManager.err.${code ?? "failed"}`));
    }
    const body = { event: overview.eventId, label, key, fieldType: type, options: type === "calculated" ? spec() : type === "select" || type === "multi" ? options.split("\n") : undefined };
    const res = await fetch("/api/fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (res?.ok) return onDone(key);
    const code = res ? ((await res.json().catch(() => ({}))) as { error?: string }).error : null;
    setError(t(`fieldsManager.err.${code ?? "failed"}`));
  }

  return (
    <form onSubmit={save} className="space-y-2 rounded-xl border border-mist bg-paper p-4 text-[13px]">
      <h3 className="text-[15px] font-semibold">{edit ? t("fieldsManager.editCalc") : t("fieldsManager.newField")}</h3>
      {!edit && (<>
      <label className="block">
        {t("fieldsManager.label")}
        <input required value={label} onChange={(e) => (setLabel(e.target.value), !keyTouched && setKey(slugKey(e.target.value)))} className={input} />
      </label>
      <label className="block">
        {t("fieldsManager.key")}
        <input required pattern="[a-zA-Z][a-zA-Z0-9_]*" value={key} onChange={(e) => (setKey(e.target.value), setKeyTouched(true))} className={`${input} font-mono`} />
      </label>
      <div className="flex flex-wrap gap-1">
        {TYPES.map((x) => (
          <button key={x} type="button" onClick={() => setType(x)} className={`rounded-lg border px-2 py-1 text-[12px] ${type === x ? "border-ember bg-paper-2" : "border-mist"} ${x === "calculated" ? "border-dashed" : ""}`}>
            {t(`fieldsManager.type.${x}`)}
          </button>
        ))}
      </div>
      </>)}
      {(type === "select" || type === "multi") && (
        <label className="block">
          {t("fieldsManager.optionsOnePerLine")}
          <textarea required rows={4} value={options} onChange={(e) => setOptions(e.target.value)} className={input} />
        </label>
      )}
      {type === "calculated" && (
        <div className="space-y-2 rounded-lg border border-dashed border-ember/60 p-2">
          <div className="flex flex-wrap gap-1">
            {CALC_KINDS.map((k) => (
              <button key={k} type="button" onClick={() => setCalc({ ...calc, kind: k })} className={`rounded border px-2 py-0.5 text-[12px] ${calc.kind === k ? "border-ember bg-paper-2" : "border-mist"}`}>
                {t(`fieldsManager.calcKind.${k}`)}
              </button>
            ))}
          </div>
          {calc.kind === "join" && (
            <>
              <div className="flex flex-wrap gap-1">
                {calc.parts.map((p, i) => (
                  <span key={p + i} className="inline-flex items-center gap-1 rounded-full bg-paper-2 px-2 py-0.5 font-mono text-[12px]">
                    {p}
                    <button type="button" aria-label="←" disabled={i === 0} onClick={() => setCalc({ ...calc, parts: calc.parts.map((x, j) => (j === i - 1 ? p : j === i ? calc.parts[i - 1] : x)) })} className="disabled:opacity-30">←</button>
                    <button type="button" aria-label="×" onClick={() => setCalc({ ...calc, parts: calc.parts.filter((_, j) => j !== i) })}>×</button>
                  </span>
                ))}
              </div>
              <select value="" onChange={(e) => e.target.value && setCalc({ ...calc, parts: [...calc.parts, e.target.value] })} className={input}>
                <option value="">{t("fieldsManager.addPart")}</option>
                {keys.filter((k) => !calc.parts.includes(k)).map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
              <select value={calc.separator} onChange={(e) => setCalc({ ...calc, separator: e.target.value })} className={input} aria-label={t("fieldsManager.separator")}>
                {SEPARATOR_PRESETS.map((s) => (
                  <option key={JSON.stringify(s)} value={s}>{t("fieldsManager.separator")}: {s === "" ? t("fieldsManager.sepNone") : s === "\n" ? t("fieldsManager.sepNewLine") : JSON.stringify(s)}</option>
                ))}
              </select>
            </>
          )}
          {calc.kind === "template" && <textarea rows={3} required value={calc.text} onChange={(e) => setCalc({ ...calc, text: e.target.value })} placeholder="{{adresa_ulice_cp}}, {{adresa_psc}} {{adresa_mesto}}" className={`${input} font-mono`} />}
          {(calc.kind === "age" || calc.kind === "if") && (
            <select required value={calc.source} onChange={(e) => setCalc({ ...calc, source: e.target.value })} className={input}>
              <option value="">{t("fieldsManager.fromField")}</option>
              {keys.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          )}
          {calc.kind === "contact" && (
            <div className="space-y-1">
              <label className="block">
                {t("fieldsManager.contact.adults")}{" "}
                <select value={calc.adult} onChange={(e) => setCalc({ ...calc, adult: e.target.value })} className={input}>
                  <option value="">{t("fieldsManager.contact.adultsGuardian")}</option>
                  <option value="auto">{t("fieldsManager.contact.adultsAuto")}</option>
                  {overview.fields.filter((f) => f.fieldType === "email").map((f) => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                {t("fieldsManager.contact.guardians")}{" "}
                <select value={calc.guardians} onChange={(e) => setCalc({ ...calc, guardians: e.target.value })} className={input}>
                  {["first", "first_receiving", "all_receiving"].map((g) => (
                    <option key={g} value={g}>{t(`fieldsManager.contact.g.${g}`)}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {calc.kind === "if" && (
            <div className="grid grid-cols-3 gap-1">
              <input value={calc.test} onChange={(e) => setCalc({ ...calc, test: e.target.value })} title={t("fieldsManager.ifTestHint")} className={input} />
              <input value={calc.then} onChange={(e) => setCalc({ ...calc, then: e.target.value })} placeholder={t("fieldsManager.then")} className={input} />
              <input value={calc.else} onChange={(e) => setCalc({ ...calc, else: e.target.value })} placeholder={t("fieldsManager.else")} className={input} />
            </div>
          )}
        </div>
      )}
      {error && <p className="text-[12px] text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button className="rounded-lg bg-ember px-3 py-1 text-white">{edit ? t("fieldsManager.save") : t("fieldsManager.create")}</button>
        <button type="button" onClick={() => onDone(null)} className="rounded-lg border border-mist px-3 py-1">{t("fieldsManager.cancel")}</button>
      </div>
    </form>
  );
}

type Preview = { blocker: string | null; fixed: boolean; template: boolean; events: number; profiles: number; registrations: number; calculated: number; settings: number; syncMappings: number };

export function RenameDialog({ field, onDone }: { field: OvField; onDone: (newKey: string | null, logId?: string) => void }) {
  const { t } = useTranslations();
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const url = `/api/fields/${encodeURIComponent(field.key)}/rename`;

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`${url}?to=${encodeURIComponent(to.trim())}`).catch(() => null);
    setPreview(res?.ok ? await res.json() : null);
  }
  async function apply() {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: to.trim(), confirm }) }).catch(() => null);
    if (!res?.ok) return setError(t(`fieldsManager.err.${res ? ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "failed" : "failed"}`));
    onDone(to.trim(), ((await res.json()) as { logId: string }).logId);
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-mist p-3 text-[12px]">
      <form onSubmit={check} className="flex gap-1">
        <input required value={to} onChange={(e) => (setTo(e.target.value), setPreview(null))} placeholder={t("fieldsManager.newKey")} className={`${input} font-mono`} />
        <button className="rounded border border-mist px-2 hover:bg-paper-2">{t("fieldsManager.checkRename")}</button>
        <button type="button" onClick={() => onDone(null)} className="rounded border border-mist px-2">{t("fieldsManager.cancel")}</button>
      </form>
      {preview?.blocker && <p className="text-red-700">{t(`fieldsManager.err.${preview.blocker}`)}</p>}
      {preview?.fixed && <p className="text-red-700">{t("fieldsManager.err.fixed_field")}</p>}
      {preview && !preview.blocker && !preview.fixed && (
        <>
          <p>{t("fieldsManager.renameWillChange")}</p>
          <ul className="list-disc pl-5">
            <li>{t("fieldsManager.renameEvents", { n: String(preview.events) })}{preview.template ? ` + ${t("fieldsManager.renameTemplate")}` : ""}</li>
            <li>{t("fieldsManager.renameValues", { profiles: String(preview.profiles), registrations: String(preview.registrations) })}</li>
            <li>{t("fieldsManager.renameSettings", { n: String(preview.settings + preview.syncMappings + preview.calculated) })}</li>
            <li>{t("fieldsManager.renameAlias", { old: field.key })}</li>
          </ul>
          <label className="block">
            {t("fieldsManager.typeToConfirm", { key: to.trim() })}
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`${input} font-mono`} />
          </label>
          <button type="button" disabled={confirm !== to.trim()} onClick={apply} className="rounded-lg bg-ember px-3 py-1 text-white disabled:opacity-40">
            {t("fieldsManager.renameNow")}
          </button>
        </>
      )}
      {error && <p className="text-red-700">{error}</p>}
    </div>
  );
}
