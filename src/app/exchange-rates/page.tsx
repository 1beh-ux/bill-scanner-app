"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

type Rate = {
  id: string;
  currency: string;
  rateDate: string;
  rateToCzk: string;
  fetchedAt: string;
};

type DayRow = { date: string; EUR?: string; PLN?: string };

const inputSm =
  "rounded-lg border border-mist bg-paper-2 px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
const btn =
  "rounded-lg bg-ember px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50 disabled:cursor-not-allowed";

export default function ExchangeRatesPage() {
  const { t } = useTranslations();

  const [rates, setRates] = useState<Rate[]>([]);
  const [missingCzk, setMissingCzk] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [singleDate, setSingleDate] = useState("");
  const [backfillDays, setBackfillDays] = useState("30");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/exchange-rates");
    if (res.ok) {
      const data = await res.json();
      setRates(data.rates);
      setMissingCzk(data.missingCzk);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function runSync(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    setError(null);

    const res = await fetch("/api/exchange-rates/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok || !data.ok) {
      setError(t("rates.syncFailed", { error: String(data.error || res.status) }));
      return;
    }

    if (data.mode === "backfill") {
      setMessage(t("rates.backfillDone", { count: String(data.days.length) }));
    } else {
      setMessage(t("rates.syncDone", { date: data.rateDate }));
    }
    load();
  }

  async function runRecalculate() {
    setBusy(true);
    setMessage(null);
    setError(null);

    const res = await fetch("/api/exchange-rates/recalculate", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok || !data.ok) {
      setError(t("rates.recalcFailed"));
      return;
    }

    setMessage(
      t("rates.recalcDone", {
        converted: String(data.converted),
        stillMissing: String(data.stillMissing),
      })
    );
    load();
  }

  // One row per day, currencies as columns.
  const byDay: DayRow[] = [];
  const index = new Map<string, DayRow>();
  for (const r of rates) {
    const date = r.rateDate.slice(0, 10);
    let row = index.get(date);
    if (!row) {
      row = { date };
      index.set(date, row);
      byDay.push(row);
    }
    if (r.currency === "EUR") row.EUR = r.rateToCzk;
    if (r.currency === "PLN") row.PLN = r.rateToCzk;
  }

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="mb-1 text-[22px] font-semibold text-ink">{t("rates.title")}</h1>
      <p className="mb-5 text-[14px] text-ink-secondary">{t("rates.subtitle")}</p>

      {error && <p className="mb-3 text-[14px] text-red-600">{error}</p>}
      {message && <p className="mb-3 text-[14px] text-pine">{message}</p>}

      <div className="mb-6 flex flex-col gap-3 rounded-lg border border-mist bg-paper-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => runSync({})} disabled={busy} className={btn}>
            {t("rates.fetchToday")}
          </button>
          <span className="text-[13px] text-ink-secondary">{t("rates.fetchTodayHint")}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={singleDate}
            onChange={(e) => setSingleDate(e.target.value)}
            className={inputSm}
          />
          <button onClick={() => runSync({ date: singleDate })} disabled={busy || !singleDate} className={btn}>
            {t("rates.fetchDate")}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            max={60}
            value={backfillDays}
            onChange={(e) => setBackfillDays(e.target.value)}
            className={inputSm + " w-20"}
          />
          <button onClick={() => runSync({ days: backfillDays })} disabled={busy} className={btn}>
            {t("rates.backfill")}
          </button>
          <span className="text-[13px] text-ink-secondary">{t("rates.backfillHint")}</span>
        </div>

        {busy && <span className="text-[13px] text-ink-secondary">{t("common.loading")}</span>}
      </div>

      <div
        className={
          "mb-6 rounded-lg border border-mist p-4 " + (missingCzk > 0 ? "bg-amber-50" : "bg-paper-2")
        }
      >
        <div className="mb-1 text-[14px] font-semibold text-ink">{t("rates.recalcTitle")}</div>
        <p className="mb-2.5 text-[13px] text-ink-secondary">
          {missingCzk > 0 ? t("rates.recalcPending", { count: String(missingCzk) }) : t("rates.recalcNone")}
        </p>
        <button
          onClick={runRecalculate}
          disabled={busy || missingCzk === 0}
          className={
            missingCzk === 0
              ? "cursor-not-allowed rounded-lg bg-mist px-3.5 py-1.5 text-[13px] text-ink-secondary"
              : btn
          }
        >
          {t("rates.recalcButton")}
        </button>
        <p className="mt-2 text-[12px] text-ink-secondary">{t("rates.recalcNote")}</p>
      </div>

      <h2 className="mb-2.5 text-[16px] font-semibold text-ink">{t("rates.tableTitle")}</h2>

      {loading ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : byDay.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("rates.empty")}</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-mist text-left">
              <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("rates.colDate")}</th>
              <th className="p-2 text-[12px] font-medium text-ink-secondary">EUR</th>
              <th className="p-2 text-[12px] font-medium text-ink-secondary">PLN</th>
            </tr>
          </thead>
          <tbody>
            {byDay.map((row) => (
              <tr key={row.date} className="border-b border-mist/60">
                <td className="p-2 text-[14px] text-ink">{new Date(row.date).toLocaleDateString("cs-CZ")}</td>
                <td className="p-2 text-[14px] text-ink">{row.EUR ? parseFloat(row.EUR).toFixed(3) : "—"}</td>
                <td className="p-2 text-[14px] text-ink">{row.PLN ? parseFloat(row.PLN).toFixed(3) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
