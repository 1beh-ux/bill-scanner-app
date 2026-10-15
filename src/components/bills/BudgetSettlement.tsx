"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildSpaydString, czechAccountToIban } from "@/lib/qr-platba";
import { useConfirm } from "@/components/ConfirmDialog";
import type { Settlement } from "@/lib/settlement";

// Rozpočet: deposits from the organization ("Zálohy") and the settlement with it -- spent vs
// budget, paid from the official account vs in cash, deposits minus cash = what goes back
// (with a QR payment to the organization's official account). src/lib/settlement.ts.
type T = (key: string, vars?: Record<string, string>) => string;
type Deposit = { id: string; amountCzk: string; receivedAt: string; note: string | null };
type Data = Settlement & { eventName: string; notApproved: number; official: { name: string; accountNumber: string; bankCode: string } | null };

const kc = (n: number) => `${n.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} Kč`;
const inputClass = "rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink";
const btnPrimary = "rounded-lg bg-ember px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

export default function BudgetSettlement({ eventId, t }: { eventId: string; t: T }) {
  const confirm = useConfirm();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [data, setData] = useState<Data | null>(null);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [form, setForm] = useState({ amountCzk: "", receivedAt: new Date().toISOString().slice(0, 10), note: "" });
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/events/${eventId}/deposits`).then((r) => (r.ok ? r.json() : [])).then(setDeposits).catch(() => {});
    fetch(`/api/events/${eventId}/settlement${approvedOnly ? "?approved=1" : ""}`).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
  }, [eventId, approvedOnly]);
  useEffect(() => {
    load();
  }, [load]);

  // QR for returning the rest to the organization's official account.
  useEffect(() => {
    const iban = data?.official ? czechAccountToIban(data.official.accountNumber, data.official.bankCode) : null;
    if (!data || !iban || data.toReturn <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the old code when nothing is to be returned
      setQr(null);
      return;
    }
    QRCode.toDataURL(buildSpaydString(iban, data.toReturn, `Vratka zalohy - ${data.eventName}`.slice(0, 60)), { margin: 1, width: 220 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [data]);

  async function add() {
    setError(null);
    const res = await fetch(`/api/events/${eventId}/deposits`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).catch(() => null);
    if (!res?.ok) return setError(t("deposits.failed"));
    setForm({ ...form, amountCzk: "", note: "" });
    load();
  }

  async function remove(d: Deposit) {
    if (!(await confirm({ message: t("deposits.deleteConfirm", { amount: kc(Number(d.amountCzk)) }), danger: true }))) return;
    await fetch(`/api/events/${eventId}/deposits?depositId=${d.id}`, { method: "DELETE" });
    load();
  }

  const row = (label: string, value: string, strong = false) => (
    <div className="flex justify-between gap-4 border-b border-mist/60 py-1 text-[14px]">
      <span className="text-ink-secondary">{label}</span>
      <span className={strong ? "font-semibold text-ink" : "text-ink"}>{value}</span>
    </div>
  );

  return (
    <div className="mt-10 flex flex-col gap-8">
      <section>
        <h2 className="mb-1 text-[17px] font-semibold text-ink">{t("deposits.title")}</h2>
        <p className="mb-3 text-[13px] text-ink-secondary">{t("deposits.hint")}</p>
        {deposits.length > 0 && (
          <ul className="mb-3 flex max-w-xl flex-col">
            {deposits.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 border-b border-mist/60 py-1.5 text-[14px]">
                <span className="text-ink-secondary">{new Date(d.receivedAt).toLocaleDateString("cs-CZ", { timeZone: "UTC" })}</span>
                <span className="flex-1 text-ink-secondary [overflow-wrap:anywhere]">{d.note}</span>
                <span className="font-medium text-ink">{kc(Number(d.amountCzk))}</span>
                <button type="button" onClick={() => remove(d)} className="text-[13px] text-ink-secondary hover:text-red-600" aria-label={t("common.delete")}>×</button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[12px] text-ink-secondary">
            {t("deposits.amount")}
            <input inputMode="decimal" value={form.amountCzk} onChange={(e) => setForm({ ...form, amountCzk: e.target.value })} placeholder="80000" className={inputClass + " mt-1 block w-32"} />
          </label>
          <label className="text-[12px] text-ink-secondary">
            {t("deposits.date")}
            <input type="date" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} className={inputClass + " mt-1 block"} />
          </label>
          <label className="text-[12px] text-ink-secondary">
            {t("deposits.note")}
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass + " mt-1 block w-56"} />
          </label>
          <button type="button" onClick={add} disabled={!form.amountCzk.trim() || !form.receivedAt} className={btnPrimary}>{t("deposits.add")}</button>
        </div>
        {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
      </section>

      {data && (
        <section className="max-w-xl">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold text-ink">{t("settlement.title")}</h2>
            <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
              <input type="checkbox" checked={approvedOnly} onChange={(e) => setApprovedOnly(e.target.checked)} />
              {t("settlement.approvedOnly")}
            </label>
          </div>
          <p className="mb-3 text-[12.5px] text-ink-secondary">
            {t("settlement.hint")}
            {!approvedOnly && data.notApproved > 0 && ` ${t("settlement.includesNotApproved", { count: String(data.notApproved) })}`}
          </p>
          {row(t("settlement.budget"), data.total.budget ? kc(data.total.budget) : "—")}
          {row(t("settlement.spent"), data.spentPercent !== null ? `${kc(data.total.spent)} / ${kc(data.total.budget)} = ${data.spentPercent.toLocaleString("cs-CZ")} %` : kc(data.total.spent), true)}
          {row(t("settlement.official"), kc(data.total.official))}
          {row(t("settlement.cash"), kc(data.total.cash))}

          <h3 className="mb-1 mt-5 text-[15px] font-semibold text-ink">{t("settlement.cashTitle")}</h3>
          {row(t("settlement.deposits"), kc(data.depositsTotal))}
          {row(t("settlement.paidCash"), kc(data.total.cash))}
          {row(data.toReturn >= 0 ? t("settlement.toReturn") : t("settlement.orgOwes"), kc(Math.abs(data.toReturn)), true)}
          {data.excluded > 0 && <p className="mt-1 text-[12px] text-amber-700">{t("billsPage.totalExcludes", { count: String(data.excluded) })}</p>}

          {data.toReturn > 0 &&
            (data.official ? (
              <div className="mt-4 flex flex-wrap items-start gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- generated data: URL */}
                {qr && <img src={qr} alt={t("settlement.qrAlt")} className="h-44 w-44 rounded bg-white p-1" />}
                <div className="text-[13px] text-ink-secondary">
                  <p className="font-medium text-ink">{t("settlement.returnTo", { name: data.official.name })}</p>
                  <p>{data.official.accountNumber}/{data.official.bankCode}</p>
                  <p>{kc(data.toReturn)}</p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-ink-secondary">
                {t("settlement.noOfficial")}{" "}
                <a href="/authors" className="text-ember hover:underline">{t("settlement.noOfficialLink")}</a>
              </p>
            ))}

          {data.lines.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-mist text-left text-ink-secondary">
                    <th className="p-1.5 font-medium">{t("eventDetail.colCategory")}</th>
                    <th className="p-1.5 font-medium">{t("settlement.colSpent")}</th>
                    <th className="p-1.5 font-medium">{t("settlement.colOfficial")}</th>
                    <th className="p-1.5 font-medium">{t("settlement.colCash")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => (
                    <tr key={l.id ?? "none"} className="border-b border-mist/60">
                      <td className="p-1.5 text-ink">{l.id ? l.name : t("settlement.noCategory")}</td>
                      <td className="p-1.5 text-ink">{kc(l.spent)}</td>
                      <td className="p-1.5 text-ink-secondary">{kc(l.official)}</td>
                      <td className="p-1.5 text-ink-secondary">{kc(l.cash)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
