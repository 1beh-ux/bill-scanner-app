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

  if (loading) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  if (!event) return <div className="p-8 text-[14px] text-ink-secondary">{t("eventDetail.notFound")}</div>;

  const totalBudget = rows.reduce((sum, r) => sum + parseFloat(r.budgetAmount || "0"), 0);
  const totalActual = rows.reduce((sum, r) => sum + parseFloat(r.actualCzk || "0"), 0);

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <a href={`/events/${id}`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("billsPage.back")}
      </a>

      <h1 className="mb-6 mt-2 text-[22px] font-semibold text-ink">
        {t("budgetPage.title")} — {event.name}
      </h1>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr className="border-b border-mist text-left">
              <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("eventDetail.colCategory")}</th>
              <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("eventDetail.colBudget")}</th>
              <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("budgetPage.colActual")}</th>
              <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("budgetPage.colRemaining")}</th>
              <th className="w-36 p-2"></th>
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
                <tr key={r.id} className="border-b border-mist/60">
                  <td className="p-2 text-[14px] text-ink">
                    {r.name}
                    {r.excludedCount > 0 && (
                      <div className="text-[12px] text-ink-secondary">
                        {t("billsPage.totalExcludes", { count: String(r.excludedCount) })}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-[14px] text-ink">{budget.toLocaleString("cs-CZ")}</td>
                  <td className={"p-2 text-[14px] " + (overBudget ? "font-semibold text-red-600" : "text-ink")}>
                    {actual.toLocaleString("cs-CZ")}
                  </td>
                  <td className={"p-2 text-[14px] " + (remaining < 0 ? "text-red-600" : "text-ink")}>
                    {remaining.toLocaleString("cs-CZ")}
                  </td>
                  <td className="p-2">
                    <div className="h-2 overflow-hidden rounded-full bg-mist">
                      <div
                        className={"h-full " + (overBudget ? "bg-red-600" : "bg-ember")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="p-2 text-[14px] font-semibold text-ink">{t("eventDetail.total")}</td>
              <td className="p-2 text-[14px] font-semibold text-ink">{totalBudget.toLocaleString("cs-CZ")}</td>
              <td
                className={
                  "p-2 text-[14px] font-semibold " + (totalActual > totalBudget ? "text-red-600" : "text-ink")
                }
              >
                {totalActual.toLocaleString("cs-CZ")}
              </td>
              <td
                className={
                  "p-2 text-[14px] font-semibold " +
                  (totalBudget - totalActual < 0 ? "text-red-600" : "text-ink")
                }
              >
                {(totalBudget - totalActual).toLocaleString("cs-CZ")}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
