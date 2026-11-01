"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// "Ruční zadání" (2026-11-01): an official bill typed in by hand -- an estimate, or a bill whose document isn't
// here yet. Counts in the totals; "chybí doklad" until a document is uploaded onto it.
type T = (key: string, vars?: Record<string, string>) => string;
const inputSm = "rounded-lg border border-mist bg-paper-2 px-2 py-1.5 text-[13px] text-ink";

export default function ManualBill({ eventId, t, onClose }: { eventId: string; t: T; onClose: () => void }) {
  const router = useRouter();
  const [payers, setPayers] = useState<{ id: string; canonicalName: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [d, setD] = useState({ billDate: new Date().toISOString().slice(0, 10), merchantName: "", totalAmount: "", currency: "CZK", payerAuthorId: "", eventCategoryId: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/events/${eventId}/payers`).then((r) => (r.ok ? r.json() : [])).then(setPayers).catch(() => setPayers([]));
    fetch(`/api/events/${eventId}/categories`).then((r) => (r.ok ? r.json() : [])).then(setCategories).catch(() => setCategories([]));
  }, [eventId]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/events/${eventId}/bills/manual`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(t("manualBill.failed"));
    const { id } = await res.json();
    router.push(`/events/${eventId}/bills/${id}`);
  }
  const set = (patch: Partial<typeof d>) => setD({ ...d, ...patch });
  return (
    <form onSubmit={save} className="mb-4 flex flex-col gap-3 rounded-lg border border-mist bg-paper p-4">
      <h2 className="text-[15px] font-semibold text-ink">{t("manualBill.title")}</h2>
      <p className="text-[12.5px] text-ink-secondary">{t("manualBill.hint")}</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-[12.5px] text-ink-secondary">
          {t("manualBill.date")}
          <input type="date" value={d.billDate} onChange={(e) => set({ billDate: e.target.value })} className={inputSm} />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-ink-secondary sm:col-span-2">
          {t("manualBill.merchant")}
          <input value={d.merchantName} onChange={(e) => set({ merchantName: e.target.value })} className={inputSm} />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-ink-secondary">
          {t("manualBill.amount")}
          <span className="flex gap-1">
            <input value={d.totalAmount} onChange={(e) => set({ totalAmount: e.target.value })} inputMode="decimal" className={inputSm + " w-full text-right"} />
            <select value={d.currency} onChange={(e) => set({ currency: e.target.value })} className={inputSm}>
              {["CZK", "EUR", "PLN"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </span>
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-ink-secondary">
          {t("manualBill.payer")}
          <select value={d.payerAuthorId} onChange={(e) => set({ payerAuthorId: e.target.value })} className={inputSm}>
            <option value="">{t("manualBill.payerEvent")}</option>
            {payers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.canonicalName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-ink-secondary">
          {t("manualBill.category")}
          <select value={d.eventCategoryId} onChange={(e) => set({ eventCategoryId: e.target.value })} className={inputSm}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-ink-secondary sm:col-span-2">
          {t("manualBill.notes")}
          <input value={d.notes} onChange={(e) => set({ notes: e.target.value })} placeholder={t("manualBill.notesPlaceholder")} className={inputSm} />
        </label>
      </div>
      {error && <p className="text-[13px] text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={busy || !(Number(d.totalAmount.replace(",", ".")) > 0)} className="rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50">
          {t("manualBill.save")}
        </button>
        <button type="button" onClick={onClose} className="text-[13px] text-ink-secondary hover:underline">
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
