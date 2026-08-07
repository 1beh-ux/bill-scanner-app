"use client";

import { useEffect, useState, use } from "react";
import { useTranslations } from "@/lib/i18n";

type EventBasic = { id: string; name: string };

type BudgetRow = {
  id: string;
  name: string;
  budgetAmount: string;
  actualCzk: string;
  excludedCount: number;
};

export default function EventBudgetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useTranslations();

  const [event, setEvent] = useState<EventBasic | null>(null);
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [evRes, budgetRes] = await Promise.all([
        fetch(`/api/events/${id}`),
        fetch(`/api/events/${id}/budget-summary`),
      ]);
      if (evRes.ok) setEvent(await evRes.json());
      if (budgetRes.ok) setRows(await budgetRes.json());
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return <div style={{ padding: "2rem" }}>{t("common.loading")}</div>;
  if (!event) return <div style={{ padding: "2rem" }}>{t("eventDetail.notFound")}</div>;

  const totalBudget = rows.reduce((sum, r) => sum + parseFloat(r.budgetAmount || "0"), 0);
  const totalActual = rows.reduce((sum, r) => sum + parseFloat(r.actualCzk || "0"), 0);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem" }}>
      <a href={`/events/${id}`} style={{ color: "#666", textDecoration: "none", fontSize: "0.9rem" }}>
        ← {t("billsPage.back")}
      </a>

      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0.5rem 0 1.5rem" }}>
        {t("budgetPage.title")} — {event.name}
      </h1>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th style={{ padding: "0.5rem" }}>{t("eventDetail.colCategory")}</th>
            <th style={{ padding: "0.5rem" }}>{t("eventDetail.colBudget")}</th>
            <th style={{ padding: "0.5rem" }}>{t("budgetPage.colActual")}</th>
            <th style={{ padding: "0.5rem" }}>{t("budgetPage.colRemaining")}</th>
            <th style={{ padding: "0.5rem", width: 140 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const budget = parseFloat(r.budgetAmount || "0");
            const actual = parseFloat(r.actualCzk || "0");
            const remaining = budget - actual;
            const pct = budget > 0 ? Math.min((actual / budget) * 100, 100) : actual > 0 ? 100 : 0;
            const overBudget = actual > budget;

            return (
              <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "0.5rem" }}>
                  {r.name}
                  {r.excludedCount > 0 && (
                    <div style={{ fontSize: "0.75rem", color: "#888" }}>
                      {t("billsPage.totalExcludes", { count: String(r.excludedCount) })}
                    </div>
                  )}
                </td>
                <td style={{ padding: "0.5rem" }}>{budget.toLocaleString("cs-CZ")}</td>
                <td
                  style={{
                    padding: "0.5rem",
                    color: overBudget ? "#c00" : undefined,
                    fontWeight: overBudget ? 600 : undefined,
                  }}
                >
                  {actual.toLocaleString("cs-CZ")}
                </td>
                <td style={{ padding: "0.5rem", color: remaining < 0 ? "#c00" : undefined }}>
                  {remaining.toLocaleString("cs-CZ")}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <div style={{ background: "#eee", borderRadius: 4, height: 8, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: overBudget ? "#c00" : "#111",
                      }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ padding: "0.5rem", fontWeight: 600 }}>{t("eventDetail.total")}</td>
            <td style={{ padding: "0.5rem", fontWeight: 600 }}>{totalBudget.toLocaleString("cs-CZ")}</td>
            <td
              style={{
                padding: "0.5rem",
                fontWeight: 600,
                color: totalActual > totalBudget ? "#c00" : undefined,
              }}
            >
              {totalActual.toLocaleString("cs-CZ")}
            </td>
            <td
              style={{
                padding: "0.5rem",
                fontWeight: 600,
                color: totalBudget - totalActual < 0 ? "#c00" : undefined,
              }}
            >
              {(totalBudget - totalActual).toLocaleString("cs-CZ")}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
