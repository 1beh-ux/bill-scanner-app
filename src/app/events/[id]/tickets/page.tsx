"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import { driveErrorText } from "@/lib/drive-error-messages";
import { itemsLine, scanTime, type OrderItem } from "@/lib/tickets";

// Vstupenky -> Objednávky (docs/public-event-tickets-spec.md): sales per price type, the door count,
// every order with its state and actions (paid by hand, send again, PDF, cancel), the CSV export and
// the account's payments the bank check couldn't pair.
type Status = "pending" | "paid" | "cancelled";
type Order = {
  id: string;
  number: number;
  createdAt: string;
  buyerName: string;
  email: string;
  phone: string | null;
  items: OrderItem[];
  totalCzk: number;
  variableSymbol: string;
  status: Status;
  source: string;
  paidAt: string | null;
  paidVia: string | null;
  ticketsSentAt: string | null;
  sendError: string | null;
  note: string | null;
  ticketCount: number;
  usedCount: number;
  scans: { seq: number; priceLabel: string; usedAt: string }[];
};
type Data = {
  eventName: string;
  hasSender: boolean;
  bankCheck: boolean;
  types: { key: string; label: string; priceCzk: number; capacity: number | null; sold: number; paid: number; left: number | null }[];
  totalCapacity: number | null;
  totalLeft: number | null;
  door: { paid: number; used: number };
  orders: Order[];
  review: { id: string; bookedAt: string; amount: number; variableSymbol: string | null; counterName: string | null; message: string | null; reason: string | null; ticketOrderId: string | null }[];
};

const btn = "rounded-lg border border-mist bg-paper px-2.5 py-1 text-[12px] text-ink hover:bg-paper-2 disabled:opacity-50";
const card = "rounded-lg border border-mist bg-paper-2 p-3";
const STATUS_STYLE: Record<Status, string> = { pending: "bg-amber-50 text-amber-700", paid: "bg-pine-bg text-pine", cancelled: "bg-paper-2 text-ink-secondary line-through" };
const when = (d: string | null) => (d ? new Date(d).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export default function TicketOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, role } = useTranslations();
  const confirm = useConfirm();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [driveDone, setDriveDone] = useState<{ count: number; url: string } | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState<string | null>(null);

  // "Zkontrolovat platby teď": the Fio check right away, then the list again.
  async function checkNow() {
    setChecking(true);
    setCheckNote(null);
    const res = await fetch(`/api/events/${id}/tickets/bank-check`, { method: "POST" });
    const r = await res.json().catch(() => ({}));
    setChecking(false);
    setCheckNote(
      !res.ok ? t("tickets.checkFailed") : r.status === "ok" ? t("tickets.checkDone", { n: String(r.settled ?? 0), review: String(r.review ?? 0) }) : r.status === "throttled" ? t("tickets.checkThrottled") : r.status === "nothing_to_do" ? t("tickets.checkNothing") : t("tickets.checkError", { code: r.code ?? "" })
    );
    load();
  }

  // The orders -> Google Sheet in the export folder (next to the bills manifest).
  async function exportToDrive() {
    setDriveBusy(true);
    setError(null);
    setDriveDone(null);
    const res = await fetch(`/api/events/${id}/tickets/export`, { method: "POST" });
    const r = await res.json().catch(() => ({}));
    setDriveBusy(false);
    if (res.ok) setDriveDone({ count: r.count, url: r.url });
    else setError(r.error === "no_export_folder" ? t("participantsPage.driveExportNoFolder") : driveErrorText(t, r.error ?? "unexpected", r));
  }
  const [filter, setFilter] = useState<Status | "all" | "entered">("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/events/${id}/tickets`, { cache: "no-store" });
    if (!res.ok) return setError(t(res.status === 403 ? "tickets.noAccess" : "tickets.loadFailed"));
    setData(await res.json());
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.orders ?? []).filter(
      (o) => (filter === "all" || (filter === "entered" ? o.usedCount > 0 : o.status === filter)) && (!q || [o.buyerName, o.email, o.phone ?? "", o.variableSymbol, String(o.number)].some((x) => x.toLowerCase().includes(q)))
    );
  }, [data, filter, query]);

  async function act(o: Order, action: "pay" | "cancel" | "resend" | "resend_order") {
    const message = {
      pay: t("tickets.confirmPay", { number: String(o.number), name: o.buyerName, total: String(o.totalCzk) }),
      cancel: t("tickets.confirmCancel", { number: String(o.number), name: o.buyerName }),
      resend: t("tickets.confirmResend", { email: o.email }),
      resend_order: t("tickets.confirmResendOrder", { email: o.email }),
    }[action];
    if (!(await confirm({ message, danger: action === "cancel" }))) return;
    setBusy(o.id);
    setError(null);
    const res = await fetch(`/api/events/${id}/tickets/${o.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const r = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) setError(t(`tickets.error.${r.error ?? "failed"}`));
    else if (r.sendError) setError(t("tickets.sendFailed", { error: r.sendError }));
    load();
  }

  async function remove(o: Order) {
    if (!(await confirm({ message: t("tickets.confirmDelete", { number: String(o.number), name: o.buyerName }), danger: true }))) return;
    setBusy(o.id);
    setError(null);
    const res = await fetch(`/api/events/${id}/tickets/${o.id}`, { method: "DELETE" });
    const r = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) setError(t(`tickets.error.${r.error ?? "failed"}`));
    load();
  }

  if (error && !data) return <div className="p-8 text-[14px] text-ink-secondary">{error}</div>;
  if (!data) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;

  const count = (s: Status | "all" | "entered") =>
    s === "all" ? data.orders.length : data.orders.filter((o) => (s === "entered" ? o.usedCount > 0 : o.status === s)).length;

  return (
    <div className="mx-auto max-w-[1200px] p-4 md:p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold text-ink">
          {t("tickets.title")} <span className="text-ink-secondary">· {data.eventName}</span>
        </h1>
        <div className="flex flex-wrap gap-2">
          <Link href={`/events/${id}/tickets/scan`} className={btn + " text-[13px]"}>
            {t("tickets.navScan")}
          </Link>
          <a href={`/api/events/${id}/tickets/export`} className={btn + " text-[13px]"}>
            {t("tickets.export")}
          </a>
          {data.bankCheck && (
            <button onClick={checkNow} disabled={checking} className={btn + " text-[13px]"}>
              {checking ? t("tickets.checking") : t("tickets.checkNow")}
            </button>
          )}
          <button onClick={exportToDrive} disabled={driveBusy} title={t("tickets.driveExportHint")} className={btn + " text-[13px]"}>
            {driveBusy ? t("participantsPage.driveExporting") : t("participantsPage.driveExport")}
          </button>
          <Link href={`/events/${id}?tab=vstupenky`} className={btn + " text-[13px]"}>
            {t("tickets.settings")}
          </Link>
        </div>
      </div>

      {!data.hasSender && <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{t("ticketSettings.noSender")}</p>}
      {!data.bankCheck && <p className="mb-3 text-[13px] text-ink-secondary">{t("tickets.noBankCheck")}</p>}
      {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}
      {checkNote && <p className="mb-3 text-[13px] text-ink">{checkNote}</p>}
      {driveDone && (
        <p className="mb-3 text-[13px] text-pine">
          {t("tickets.driveExportDone", { count: String(driveDone.count) })}{" "}
          <a href={driveDone.url} target="_blank" rel="noreferrer" className="underline">
            {t("participantsPage.driveExportOpen")}
          </a>
        </p>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.types.map((ty) => (
          <div key={ty.key} className={card}>
            <p className="text-[12px] text-ink-secondary">
              {ty.label} · {ty.priceCzk} Kč
            </p>
            <p className="text-[18px] font-semibold text-ink">
              {ty.sold}
              {ty.capacity ? <span className="text-[14px] font-normal text-ink-secondary"> / {ty.capacity}</span> : null}
            </p>
            <p className="text-[12px] text-ink-secondary">{t("tickets.typeStats", { paid: String(ty.paid), left: ty.left === null ? "∞" : String(ty.left) })}</p>
          </div>
        ))}
        {data.totalCapacity !== null && (
          <div className={card}>
            <p className="text-[12px] text-ink-secondary">{t("tickets.total")}</p>
            <p className="text-[18px] font-semibold text-ink">
              {data.types.reduce((a, x) => a + x.sold, 0)} <span className="text-[14px] font-normal text-ink-secondary">/ {data.totalCapacity}</span>
            </p>
            <p className="text-[12px] text-ink-secondary">{t("tickets.left", { left: String(data.totalLeft ?? 0) })}</p>
          </div>
        )}
        <div className={card}>
          <p className="text-[12px] text-ink-secondary">{t("tickets.door")}</p>
          <p className="text-[18px] font-semibold text-ink">
            {data.door.used} <span className="text-[14px] font-normal text-ink-secondary">/ {data.door.paid}</span>
          </p>
          <p className="text-[12px] text-ink-secondary">{t("tickets.doorLeft", { left: String(data.door.paid - data.door.used) })}</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["all", "pending", "paid", "cancelled", "entered"] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={"rounded-full px-3 py-1 text-[13px] " + (filter === s ? "bg-ember text-white" : "bg-paper-2 text-ink hover:bg-mist")}>
            {t(`tickets.status.${s}`)} ({count(s)})
          </button>
        ))}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("tickets.search")} className="ml-auto w-56 rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px]" />
      </div>

      {shown.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("tickets.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-mist text-left text-[12px] text-ink-secondary">
                <th className="p-2 font-medium">{t("tickets.colNumber")}</th>
                <th className="p-2 font-medium">{t("tickets.colBuyer")}</th>
                <th className="p-2 font-medium">{t("tickets.colItems")}</th>
                <th className="p-2 font-medium">{t("tickets.colTotal")}</th>
                <th className="p-2 font-medium">{t("tickets.colStatus")}</th>
                <th className="p-2 font-medium">{t("tickets.colDoor")}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => (
                <tr key={o.id} className="border-b border-mist/60 align-top text-[14px]">
                  <td className="whitespace-nowrap p-2 text-ink">
                    {o.number}
                    <div className="text-[12px] text-ink-secondary">{when(o.createdAt)}</div>
                    {o.source === "portal" && <div className="text-[11px] text-ink-secondary">{t("tickets.fromPortal")}</div>}
                  </td>
                  <td className="p-2 text-ink [overflow-wrap:anywhere]">
                    {o.buyerName}
                    <div className="text-[12px] text-ink-secondary">
                      {o.email}
                      {o.phone && ` · ${o.phone}`}
                    </div>
                    {o.note && <div className="text-[12px] italic text-ink-secondary">{o.note}</div>}
                  </td>
                  <td className="p-2 text-[13px] text-ink">{itemsLine(o.items)}</td>
                  <td className="whitespace-nowrap p-2 text-ink">
                    {o.totalCzk} Kč<div className="text-[12px] text-ink-secondary">VS {o.variableSymbol}</div>
                  </td>
                  <td className="p-2">
                    <span className={"whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] " + STATUS_STYLE[o.status]}>{t(`tickets.status.${o.status}`)}</span>
                    {o.paidAt && <div className="mt-1 text-[12px] text-ink-secondary">{t(o.paidVia === "bank" ? "tickets.paidBank" : "tickets.paidManual", { when: when(o.paidAt) })}</div>}
                    {o.ticketsSentAt && <div className="text-[12px] text-pine">{t("tickets.sent", { when: when(o.ticketsSentAt) })}</div>}
                    {o.sendError && <div className="text-[12px] text-red-600 [overflow-wrap:anywhere]">{t("tickets.sendFailed", { error: o.sendError })}</div>}
                  </td>
                  <td className="whitespace-nowrap p-2 text-ink">
                    {o.usedCount} / {o.ticketCount}
                    {/* Each ticket that went through the door, to the second. */}
                    {o.scans.map((s) => (
                      <div key={s.seq} className="text-[11.5px] text-ink-secondary">
                        {t("tickets.scanLine", { seq: String(s.seq), type: s.priceLabel, when: scanTime(s.usedAt) })}
                      </div>
                    ))}
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {o.status === "pending" && (
                        <>
                          <button onClick={() => act(o, "pay")} disabled={busy === o.id} className={btn}>{t("tickets.actPay")}</button>
                          <button onClick={() => act(o, "resend_order")} disabled={busy === o.id} className={btn}>{t("tickets.actResendOrder")}</button>
                        </>
                      )}
                      {o.status === "paid" && <button onClick={() => act(o, "resend")} disabled={busy === o.id} className={btn}>{t("tickets.actResend")}</button>}
                      {o.status !== "cancelled" && (
                        <>
                          <a href={`/api/events/${id}/tickets/${o.id}/pdf`} target="_blank" rel="noreferrer" className={btn}>PDF</a>
                          <button onClick={() => act(o, "cancel")} disabled={busy === o.id} className={btn + " text-red-700"}>{t("tickets.actCancel")}</button>
                        </>
                      )}
                      {o.status === "cancelled" && role === "admin" && (
                        <button onClick={() => remove(o)} disabled={busy === o.id} className={btn + " text-red-700"}>{t("tickets.actDelete")}</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.review.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 text-[16px] font-semibold text-ink">{t("tickets.reviewTitle")}</h2>
          <p className="mb-2 text-[12px] text-ink-secondary">{t("tickets.reviewHint")}</p>
          <ul className="flex flex-col gap-1 text-[13px]">
            {data.review.map((m) => (
              <li key={m.id} className="flex flex-wrap gap-x-3 text-ink">
                <span>{new Date(m.bookedAt).toLocaleDateString("cs-CZ")}</span>
                <span className="font-medium">{m.amount} Kč</span>
                <span>VS {m.variableSymbol ?? "—"}</span>
                <span className="text-ink-secondary">{m.counterName}</span>
                <span className="text-ink-secondary">{m.message}</span>
                {m.reason && <span className="text-amber-700">{t(`tickets.reviewReason.${m.reason}`)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
