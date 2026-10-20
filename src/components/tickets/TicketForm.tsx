"use client";

import { useEffect, useState } from "react";
import { portalInputClass as inputClass } from "@/components/registration/FieldInput";
import { postScrollTop } from "@/components/embed/embed-client";
import { withTicketTexts } from "@/lib/tickets";

// The ticket order form of a public event (docs/public-event-tickets-spec.md), on the public page
// /r/<slug> and in the parent portal: buyer + how many tickets of each price type, then how to pay
// (account, VS, the payment QR) and "Zkontrolovat platbu" when the event's Fio check is on.
// The server validates everything again (src/lib/tickets.ts validateOrder).
type T = (key: string, vars?: Record<string, string>) => string;
export type SaleType = { key: string; label: string; priceCzk: number; left: number | null };
type Confirmation = { number: number; totalCzk: number; variableSymbol: string; account: string | null; qr: string | null; statusToken: string | null; paid: boolean };

const btnPrimary = "rounded-lg bg-ember px-4 py-2.5 text-[15px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
const btn = "rounded-lg border border-mist px-3 py-2 text-[14px] text-ink hover:bg-paper-2 disabled:opacity-50";
const card = "rounded-lg border border-mist bg-paper p-4";
// "Zkontrolovat platbu": every 10 s for 2 minutes (the bank check itself is throttled to 35 s).
const POLL_MS = 10_000;
const POLL_FOR_MS = 2 * 60_000;

export default function TicketForm({
  types,
  maxPerOrder,
  submitUrl,
  extraBody,
  prefill,
  embed,
  fetcher = fetch,
  texts,
  showLeft = true,
  t: tBase,
}: {
  types: SaleType[];
  maxPerOrder: number;
  submitUrl: string;
  extraBody?: Record<string, unknown>;
  prefill?: { buyerName: string; email: string; phone: string };
  embed?: boolean;
  // The portal's fetch (adds the gate header when embedded).
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
  // The event's own wording (Nastavení akce -> Vstupenky -> Texty na webu) and the "zbývá N" switch.
  texts?: Record<string, string>;
  showLeft?: boolean;
  t: T;
}) {
  const t = withTicketTexts(tBase, texts);
  const [counts, setCounts] = useState<Record<string, number>>(() => (types.length === 1 ? { [types[0].key]: 1 } : {}));
  const [buyer, setBuyer] = useState(prefill ?? { buyerName: "", email: "", phone: "" });
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [done, setDone] = useState<Confirmation | null>(null);
  const [polling, setPolling] = useState(false);
  const [paid, setPaid] = useState(false);

  const total = types.reduce((s, ty) => s + ty.priceCzk * (counts[ty.key] ?? 0), 0);
  const count = Object.values(counts).reduce((a, b) => a + b, 0);
  const soldOut = types.every((ty) => ty.left === 0);
  useEffect(() => {
    if (embed && (done || errors)) postScrollTop();
  }, [embed, done, errors]);

  useEffect(() => {
    if (!polling || !done?.statusToken) return;
    const until = Date.now() + POLL_FOR_MS;
    let stop = false;
    const tick = async () => {
      const r = await fetch(`/api/public/tickets/${done.statusToken}`, { method: "POST" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      if (stop) return;
      if (r?.paid) {
        setPaid(true);
        setPolling(false);
      } else if (Date.now() > until) setPolling(false);
      else setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [polling, done]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors(null);
    const res = await fetcher(submitUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...extraBody, ...buyer, note, website, counts }),
    }).catch(() => null);
    setBusy(false);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) {
      setDone(d);
      setPaid(!!d.paid);
      return;
    }
    setErrors(
      res?.status === 429
        ? [t("ticketForm.throttled")]
        : Array.isArray(d.fields)
          ? d.fields.map((c: string) => (c.startsWith("sold_out.") ? t("ticketForm.err.soldOutType", { type: types.find((ty) => `sold_out.${ty.key}` === c)?.label ?? "" }) : t(`ticketForm.err.${c}`, { max: String(maxPerOrder) })))
          : [t("ticketForm.failed")]
    );
  }

  if (done) {
    return (
      <div className={card + " flex flex-col gap-3"}>
        <p className="text-[18px] font-semibold text-ink">{t("ticketForm.doneTitle", { number: String(done.number) })}</p>
        {paid ? (
          <p className="text-[15px] text-pine">{t(done.totalCzk === 0 ? "ticketForm.doneFree" : "ticketForm.paidNow")}</p>
        ) : (
          <>
            <p className="text-[14px] text-ink">{t("ticketForm.payHint")}</p>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px]">
                <dt className="text-ink-secondary">{t("ticketForm.account")}</dt>
                <dd className="font-medium text-ink">{done.account ?? "—"}</dd>
                <dt className="text-ink-secondary">{t("ticketForm.vs")}</dt>
                <dd className="font-medium text-ink">{done.variableSymbol}</dd>
                <dt className="text-ink-secondary">{t("ticketForm.amount")}</dt>
                <dd className="font-medium text-ink">{done.totalCzk} Kč</dd>
              </dl>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {done.qr && <img src={done.qr} alt={t("ticketForm.qrAlt")} className="h-40 w-40 rounded bg-white p-1" />}
            </div>
            <p className="text-[13px] text-ink-secondary">{t("ticketForm.emailHint", { email: buyer.email })}</p>
            {done.statusToken && (
              <button type="button" onClick={() => setPolling(true)} disabled={polling} className={btn + " self-start"}>
                {polling ? t("ticketForm.checking") : t("ticketForm.checkPayment")}
              </button>
            )}
            {done.statusToken && !polling && <p className="text-[12px] text-ink-secondary">{t("ticketForm.checkHint")}</p>}
          </>
        )}
      </div>
    );
  }

  if (types.length === 0) return <p className="text-[14px] text-ink-secondary">{t("ticketForm.notReady")}</p>;
  if (soldOut) return <p className="text-[16px] font-semibold text-ink">{t("ticketForm.soldOut")}</p>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {/* Honeypot: invisible to people, bots fill it in. */}
      <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <section className={card + " flex flex-col gap-3"}>
        <h3 className="text-[16px] font-semibold text-ink">{t("ticketForm.ticketsTitle")}</h3>
        {types.map((ty) => {
          const max = Math.min(maxPerOrder, ty.left ?? maxPerOrder);
          return (
            <div key={ty.key} className="flex items-center gap-3">
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" aria-label="−" disabled={!counts[ty.key]} onClick={() => setCounts((c) => ({ ...c, [ty.key]: Math.max(0, (c[ty.key] ?? 0) - 1) }))} className={btn + " w-10"}>
                  −
                </button>
                <span className="w-8 text-center text-[16px] font-medium text-ink" aria-live="polite">
                  {counts[ty.key] ?? 0}
                </span>
                <button type="button" aria-label="+" disabled={(counts[ty.key] ?? 0) >= max || count >= maxPerOrder} onClick={() => setCounts((c) => ({ ...c, [ty.key]: (c[ty.key] ?? 0) + 1 }))} className={btn + " w-10"}>
                  +
                </button>
              </div>
              <div className="min-w-0">
                <p className="text-[15px] text-ink">{ty.label}</p>
                <p className="text-[13px] text-ink-secondary">
                  {ty.priceCzk} Kč
                  {ty.left === 0 ? ` · ${t("ticketForm.typeSoldOut")}` : ty.left !== null && showLeft && ` · ${t("ticketForm.left", { left: String(ty.left) })}`}
                </p>
              </div>
            </div>
          );
        })}
        <p className="text-[15px] font-semibold text-ink">{t("ticketForm.total", { total: String(total) })}</p>
        <p className="text-[12px] text-ink-secondary">{t("ticketForm.maxHint", { max: String(maxPerOrder) })}</p>
      </section>

      <section className={card + " grid gap-3 sm:grid-cols-2"}>
        <label className="text-[13px] text-ink-secondary sm:col-span-2">
          {t("ticketForm.name")} *
          <input required value={buyer.buyerName} onChange={(e) => setBuyer((b) => ({ ...b, buyerName: e.target.value }))} autoComplete="name" className={inputClass + " mt-1"} />
        </label>
        <label className="text-[13px] text-ink-secondary">
          {t("ticketForm.email")} *
          <input required type="email" value={buyer.email} onChange={(e) => setBuyer((b) => ({ ...b, email: e.target.value }))} autoComplete="email" className={inputClass + " mt-1"} />
        </label>
        <label className="text-[13px] text-ink-secondary">
          {t("ticketForm.phone")}
          <input type="tel" value={buyer.phone} onChange={(e) => setBuyer((b) => ({ ...b, phone: e.target.value }))} autoComplete="tel" className={inputClass + " mt-1"} />
        </label>
        <label className="text-[13px] text-ink-secondary sm:col-span-2">
          {t("ticketForm.note")}
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass + " mt-1"} />
        </label>
      </section>

      {errors && (
        <ul className="rounded-lg border border-red-300 bg-red-50 p-3 text-[14px] text-red-700" role="alert">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <button type="submit" disabled={busy || count === 0} className={btnPrimary + " self-start"}>
        {busy ? t("ticketForm.sending") : t("ticketForm.submit", { total: String(total) })}
      </button>
    </form>
  );
}
