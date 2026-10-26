"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";

// "Hromadná úprava odpovědí" (Účastníci, Zdraví): pick a question, tick the answers to change (e.g. every
// "ne" in Alergie) and clear or replace them -- in this event, and optionally in the Členové profiles
// (src/app/api/events/[id]/field-values/route.ts).
type FieldRow = { key: string; label: string; kind: string; fieldType: string; active?: boolean };
type Answer = { value: string; count: number };
const btn = "rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2 disabled:opacity-50";
const inputClass = "rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";

export default function BulkAnswers({ eventId, onDone }: { eventId: string; onDone?: () => void }) {
  const { t } = useTranslations();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [fieldKey, setFieldKey] = useState("");
  const [answers, setAnswers] = useState<Answer[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"clear" | "replace">("clear");
  const [replacement, setReplacement] = useState("");
  const [profiles, setProfiles] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/events/${eventId}/participant-fields`)
      .then((r) => (r.ok ? r.json() : []))
      .then((all: FieldRow[]) => setFields(all.filter((f) => f.kind === "custom" && f.active !== false && f.fieldType !== "composite" && f.fieldType !== "image").sort((a, b) => a.label.localeCompare(b.label, "cs"))))
      .catch(() => setFields([]));
  }, [open, eventId]);

  async function loadAnswers(key: string) {
    setFieldKey(key);
    setPicked(new Set());
    setAnswers(null);
    setMessage(null);
    if (!key) return;
    const d = await fetch(`/api/events/${eventId}/field-values?fieldKey=${encodeURIComponent(key)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setAnswers(d?.answers ?? []);
  }

  const count = (answers ?? []).filter((a) => picked.has(a.value)).reduce((s, a) => s + a.count, 0);

  async function apply() {
    if (!picked.size) return;
    const what = mode === "clear" ? t("bulkAnswers.confirmClear", { n: String(count) }) : t("bulkAnswers.confirmReplace", { n: String(count), value: replacement.trim() });
    if (!(await confirm({ message: what, danger: true }))) return;
    setBusy(true);
    const res = await fetch(`/api/events/${eventId}/field-values`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldKey, answers: [...picked], replacement: mode === "replace" ? replacement : null, profiles }),
    }).catch(() => null);
    setBusy(false);
    const d = res?.ok ? await res.json() : null;
    setMessage(d ? t("bulkAnswers.done", { participants: String(d.participants), profiles: String(d.profiles) }) : t("bulkAnswers.failed"));
    if (d) {
      await loadAnswers(fieldKey);
      onDone?.();
    }
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={btn}>
        {t("bulkAnswers.open")}
      </button>
    );
  return (
    <section className="basis-full rounded-lg border border-mist bg-paper p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-ink">{t("bulkAnswers.title")}</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-[13px] text-ink-secondary hover:underline">
          {t("common.close")}
        </button>
      </div>
      <p className="mb-3 max-w-2xl text-[12.5px] text-ink-secondary">{t("bulkAnswers.hint")}</p>
      <label className="flex max-w-md flex-col gap-1 text-[13px] text-ink-secondary">
        {t("bulkAnswers.field")}
        <select value={fieldKey} onChange={(e) => loadAnswers(e.target.value)} className={inputClass}>
          <option value="">—</option>
          {fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      {answers && answers.length === 0 && <p className="mt-3 text-[13px] text-ink-secondary">{t("bulkAnswers.none")}</p>}
      {answers && answers.length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-lg border border-mist p-2">
            {answers.map((a) => (
              <label key={a.value} className="flex items-start gap-2 text-[14px] text-ink">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={picked.has(a.value)}
                  onChange={(e) => setPicked((x) => { const n = new Set(x); if (e.target.checked) n.add(a.value); else n.delete(a.value); return n; })}
                />
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{a.value}</span>
                <span className="shrink-0 text-[12px] tabular-nums text-ink-secondary">{a.count}×</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[14px] text-ink">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="bulkMode" checked={mode === "clear"} onChange={() => setMode("clear")} />
              {t("bulkAnswers.clear")}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="bulkMode" checked={mode === "replace"} onChange={() => setMode("replace")} />
              {t("bulkAnswers.replace")}
            </label>
            {mode === "replace" && <input value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder={t("bulkAnswers.replacement")} className={inputClass} />}
          </div>
          <label className="flex items-start gap-2 text-[13px] text-ink-secondary">
            <input type="checkbox" className="mt-0.5" checked={profiles} onChange={(e) => setProfiles(e.target.checked)} />
            {t("bulkAnswers.profiles")}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={apply} disabled={busy || picked.size === 0 || (mode === "replace" && !replacement.trim())} className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50">
              {t("bulkAnswers.apply", { n: String(count) })}
            </button>
            {message && <span className="text-[13px] text-ink">{message}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
