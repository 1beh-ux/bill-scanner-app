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

  const inputStyle: React.CSSProperties = {
    padding: "0.4rem",
    border: "1px solid #ccc",
    borderRadius: 4,
    fontSize: "0.9rem",
  };

  const btnStyle: React.CSSProperties = {
    padding: "0.45rem 0.9rem",
    background: "#111",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: "0.9rem",
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.4rem" }}>
        {t("rates.title")}
      </h1>
      <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "1.25rem" }}>
        {t("rates.subtitle")}
      </p>

      {error && <p style={{ color: "#c00", marginBottom: "0.75rem" }}>{error}</p>}
      {message && <p style={{ color: "#080", marginBottom: "0.75rem" }}>{message}</p>}

      <div
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 6,
          padding: "1rem",
          marginBottom: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.85rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => runSync({})} disabled={busy} style={btnStyle}>
            {t("rates.fetchToday")}
          </button>
          <span style={{ fontSize: "0.85rem", color: "#666" }}>
            {t("rates.fetchTodayHint")}
          </span>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="date"
            value={singleDate}
            onChange={(e) => setSingleDate(e.target.value)}
            style={inputStyle}
          />
          <button
            onClick={() => runSync({ date: singleDate })}
            disabled={busy || !singleDate}
            style={btnStyle}
          >
            {t("rates.fetchDate")}
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="number"
            min={1}
            max={60}
            value={backfillDays}
            onChange={(e) => setBackfillDays(e.target.value)}
            style={{ ...inputStyle, width: 80 }}
          />
          <button
            onClick={() => runSync({ days: backfillDays })}
            disabled={busy}
            style={btnStyle}
          >
            {t("rates.backfill")}
          </button>
          <span style={{ fontSize: "0.85rem", color: "#666" }}>
            {t("rates.backfillHint")}
          </span>
        </div>

        {busy && <span style={{ color: "#666", fontSize: "0.85rem" }}>{t("common.loading")}</span>}
      </div>

      <div
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 6,
          padding: "1rem",
          marginBottom: "1.5rem",
          background: missingCzk > 0 ? "#fffaf0" : "#fff",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
          {t("rates.recalcTitle")}
        </div>
        <p style={{ fontSize: "0.85rem", color: "#666", margin: "0 0 0.6rem" }}>
          {missingCzk > 0
            ? t("rates.recalcPending", { count: String(missingCzk) })
            : t("rates.recalcNone")}
        </p>
        <button
          onClick={runRecalculate}
          disabled={busy || missingCzk === 0}
          style={{
            ...btnStyle,
            background: missingCzk === 0 ? "#f5f5f5" : "#111",
            color: missingCzk === 0 ? "#999" : "#fff",
            cursor: missingCzk === 0 ? "not-allowed" : "pointer",
          }}
        >
          {t("rates.recalcButton")}
        </button>
        <p style={{ fontSize: "0.8rem", color: "#888", margin: "0.5rem 0 0" }}>
          {t("rates.recalcNote")}
        </p>
      </div>

      <h2 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.6rem" }}>
        {t("rates.tableTitle")}
      </h2>

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : byDay.length === 0 ? (
        <p>{t("rates.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "0.5rem" }}>{t("rates.colDate")}</th>
              <th style={{ padding: "0.5rem" }}>EUR</th>
              <th style={{ padding: "0.5rem" }}>PLN</th>
            </tr>
          </thead>
          <tbody>
            {byDay.map((row) => (
              <tr key={row.date} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "0.5rem" }}>
                  {new Date(row.date).toLocaleDateString("cs-CZ")}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {row.EUR ? parseFloat(row.EUR).toFixed(3) : "—"}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {row.PLN ? parseFloat(row.PLN).toFixed(3) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}