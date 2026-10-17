"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";

// Rozpočet -> Příjmy a výsledek: the event's income lines (EventIncome), each planned and real, and
// the result both ways: planned income - budget, real income - real spending. The budget is a plan
// made months ahead; the real result comes from what the kids paid, the organization's subsidy etc.
type T = (key: string, vars?: Record<string, string>) => string;
type Row = { id: string; name: string; plannedCzk: number | null; actualCzk: number | null; note: string | null };

const kc = (n: number) => `${n.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} Kč`;
const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px] text-ink";
const PRESETS = ["budgetIncome.preset.fees", "budgetIncome.preset.orgSubsidy", "budgetIncome.preset.grant", "budgetIncome.preset.sponsors"];

export default function BudgetIncomes({ eventId, plannedCosts, actualCosts, t }: { eventId: string; plannedCosts: number; actualCosts: number; t: T }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[]>([]);
  const [bank, setBank] = useState<{ incomeType: string; sum: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/events/${eventId}/incomes`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      setRows(d.rows);
      setBank(d.bank);
    }).catch(() => {});
  }, [eventId]);
  useEffect(load, [load]);

  async function save(body: object) {
    setError(null);
    const r = await fetch(`/api/events/${eventId}/incomes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) setError(t(`budgetIncome.error.${(await r.json().catch(() => ({}))).error ?? "failed"}`));
    load();
  }
  // Amounts go as typed ("12 500", "", ...); the API parses them.
  const update = (row: Row, patch: Record<string, string | null>) => save({ ...row, ...patch });
  async function remove(row: Row) {
    if (!(await confirm({ message: t("budgetIncome.deleteConfirm", { name: row.name }), danger: true }))) return;
    await fetch(`/api/events/${eventId}/incomes?incomeId=${row.id}`, { method: "DELETE" });
    load();
  }

  const plannedIncome = rows.reduce((s, r) => s + (r.plannedCzk ?? 0), 0);
  const actualIncome = rows.reduce((s, r) => s + (r.actualCzk ?? 0), 0);
  const plannedResult = plannedIncome - plannedCosts;
  const actualResult = actualIncome - actualCosts;
  const result = (n: number) => <span className={n < 0 ? "font-semibold text-red-600" : "font-semibold text-pine"}>{n > 0 ? "+" : ""}{kc(n)}</span>;
  const num = (v: string) => (v.trim() === "" ? null : v);

  return (
    <section className="mt-8">
      <h2 className="mb-1 text-[18px] font-semibold text-ink">{t("budgetIncome.title")}</h2>
      <p className="mb-3 max-w-3xl text-[13px] text-ink-secondary">{t("budgetIncome.hint")}</p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-mist text-left text-[12px] text-ink-secondary">
              <th className="p-2 font-medium">{t("budgetIncome.colName")}</th>
              <th className="w-36 p-2 font-medium">{t("budgetIncome.colPlanned")}</th>
              <th className="w-36 p-2 font-medium">{t("budgetIncome.colActual")}</th>
              <th className="p-2 font-medium">{t("budgetIncome.colNote")}</th>
              <th className="w-8 p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-mist/60">
                <td className="p-1.5"><input defaultValue={r.name} onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && update(r, { name: e.target.value })} className={inputClass} aria-label={t("budgetIncome.colName")} /></td>
                <td className="p-1.5"><input inputMode="decimal" defaultValue={r.plannedCzk ?? ""} onBlur={(e) => update(r, { plannedCzk: num(e.target.value) })} className={inputClass + " text-right"} aria-label={t("budgetIncome.colPlanned")} /></td>
                <td className="p-1.5"><input inputMode="decimal" defaultValue={r.actualCzk ?? ""} onBlur={(e) => update(r, { actualCzk: num(e.target.value) })} className={inputClass + " text-right"} aria-label={t("budgetIncome.colActual")} /></td>
                <td className="p-1.5"><input defaultValue={r.note ?? ""} onBlur={(e) => e.target.value !== (r.note ?? "") && update(r, { note: e.target.value })} className={inputClass} aria-label={t("budgetIncome.colNote")} /></td>
                <td className="p-1.5"><button type="button" onClick={() => remove(r)} aria-label={t("budgetIncome.delete")} className="text-ink-secondary hover:text-red-600">✕</button></td>
              </tr>
            ))}
            <tr>
              <td className="p-1.5" colSpan={5}>
                <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; const name = (f.elements.namedItem("name") as HTMLInputElement).value; if (name.trim()) save({ name }).then(() => f.reset()); }}>
                  <input name="name" placeholder={t("budgetIncome.newPlaceholder")} className={inputClass + " max-w-xs"} />
                  <button type="submit" className="rounded-lg border border-mist bg-paper-2 px-3 py-1 text-[13px] text-ink hover:bg-mist">{t("budgetIncome.add")}</button>
                  {PRESETS.filter((k) => !rows.some((r) => r.name === t(k))).map((k) => (
                    <button key={k} type="button" onClick={() => save({ name: t(k) })} className="rounded-full border border-dashed border-mist px-2.5 py-0.5 text-[12px] text-ink-secondary hover:text-ink">+ {t(k)}</button>
                  ))}
                </form>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t border-mist">
              <td className="p-2 font-semibold text-ink">{t("budgetIncome.totalIncome")}</td>
              <td className="p-2 text-right font-semibold text-ink">{kc(plannedIncome)}</td>
              <td className="p-2 text-right font-semibold text-ink">{kc(actualIncome)}</td>
              <td colSpan={2}></td>
            </tr>
            <tr>
              <td className="p-2 text-ink-secondary">{t("budgetIncome.costs")}</td>
              <td className="p-2 text-right text-ink-secondary">{kc(plannedCosts)}</td>
              <td className="p-2 text-right text-ink-secondary">{kc(actualCosts)}</td>
              <td colSpan={2} className="p-2 text-[12px] text-ink-secondary">{t("budgetIncome.costsHint")}</td>
            </tr>
            <tr className="border-t border-mist">
              <td className="p-2 font-semibold text-ink">{t("budgetIncome.result")}</td>
              <td className="p-2 text-right">{result(plannedResult)}</td>
              <td className="p-2 text-right">{result(actualResult)}</td>
              <td colSpan={2} className="p-2 text-[12px] text-ink-secondary">{t("budgetIncome.resultHint")}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {bank && bank.length > 0 && (
        <p className="mt-2 text-[12px] text-ink-secondary">
          {t("budgetIncome.bankHint")} {bank.map((b) => `${t(`bankIncome.${b.incomeType}`)} ${kc(b.sum)}`).join(" · ")}
        </p>
      )}
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
    </section>
  );
}
