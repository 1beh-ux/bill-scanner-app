"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DUPLICATE_PARTS, type DuplicatePart } from "@/lib/event-duplicate-parts";

// Akce -> "Duplikovat akci" (2026-10-23): 1. which event, the new name and dates; 2. what to copy
// (each part explained; Drive, access and planning off by default); 3. a summary, then create and open
// the new event's settings. Never copied: participants, receipts, orders, the public address.
type T = (key: string, vars?: Record<string, string>) => string;
type Ev = { id: string; name: string; startDate: string; kind?: string };
const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const btn = "rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2";

export default function DuplicateEventWizard({ events, t, onClose }: { events: Ev[]; t: T; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [sourceId, setSourceId] = useState(events[0]?.id ?? "");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [parts, setParts] = useState<Set<DuplicatePart>>(new Set(DUPLICATE_PARTS.filter((p) => p.on).map((p) => p.key)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const source = events.find((e) => e.id === sourceId);
  const shown = DUPLICATE_PARTS.filter((p) => p.key !== "tickets" || source?.kind === "public_event");
  const step1Ok = !!sourceId && !!name.trim() && !!startDate && !!endDate && endDate >= startDate;

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/events/${sourceId}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), startDate, endDate, parts: [...parts] }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(t("duplicate.failed"));
    const { id } = await res.json();
    router.push(`/events/${id}?tab=akce`);
  }

  return (
    <section className="mb-8 rounded-lg border border-mist bg-paper-2 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold text-ink">{t("duplicate.title")}</h2>
        <span className="text-[12px] text-ink-secondary">{t("duplicate.step", { n: String(step) })}</span>
      </div>
      {step === 1 && (
        <div className="flex max-w-xl flex-col gap-3">
          <label className="text-[13px] text-ink-secondary">
            {t("duplicate.source")}
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={inputClass + " mt-1"}>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({new Date(e.startDate).toLocaleDateString("cs-CZ")})
                </option>
              ))}
            </select>
          </label>
          <label className="text-[13px] text-ink-secondary">
            {t("duplicate.name")}
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={source?.name} className={inputClass + " mt-1"} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[13px] text-ink-secondary">
              {t("eventBasics.start")}
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass + " mt-1"} />
            </label>
            <label className="text-[13px] text-ink-secondary">
              {t("eventBasics.end")}
              <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass + " mt-1"} />
            </label>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="flex max-w-2xl flex-col gap-2">
          <p className="text-[13px] text-ink-secondary">{t("duplicate.partsHint")}</p>
          {shown.map((p) => (
            <label key={p.key} className="flex items-start gap-2 rounded-lg border border-mist bg-paper p-2 text-[14px] text-ink">
              <input
                type="checkbox"
                checked={parts.has(p.key)}
                onChange={(e) => {
                  const next = new Set(parts);
                  if (e.target.checked) next.add(p.key);
                  else next.delete(p.key);
                  setParts(next);
                }}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{t(`duplicate.part.${p.key}`)}</span>
                <span className="block text-[12.5px] text-ink-secondary">{t(`duplicate.partHint.${p.key}`)}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {step === 3 && (
        <div className="flex max-w-2xl flex-col gap-2 text-[14px] text-ink">
          <p>{t("duplicate.summary", { source: source?.name ?? "", name: name.trim(), from: new Date(startDate).toLocaleDateString("cs-CZ"), to: new Date(endDate).toLocaleDateString("cs-CZ") })}</p>
          <ul className="list-disc pl-5">
            {shown.filter((p) => parts.has(p.key)).map((p) => (
              <li key={p.key}>{t(`duplicate.part.${p.key}`)}</li>
            ))}
          </ul>
          <p className="text-[12.5px] text-ink-secondary">{t("duplicate.never")}</p>
        </div>
      )}
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={step === 1 ? onClose : () => setStep(step - 1)} className={btn}>
          {t(step === 1 ? "common.cancel" : "duplicate.back")}
        </button>
        {step < 3 ? (
          <button type="button" onClick={() => setStep(step + 1)} disabled={step === 1 && !step1Ok} className={btnPrimary}>
            {t("duplicate.next")}
          </button>
        ) : (
          <button type="button" onClick={create} disabled={busy} className={btnPrimary}>
            {busy ? t("common.loading") : t("duplicate.create")}
          </button>
        )}
      </div>
    </section>
  );
}
