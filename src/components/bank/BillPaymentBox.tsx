"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { dmy, kc } from "@/components/bank/bank-format";

// Bill detail -> Platba (docs/bank-reconciliation.md A7): how the bill was paid. Paired payments
// (counterparty only with Banka), "Spárovat s platbou" (Banka users), Hotově / Jiný účet by hand.
type T = (key: string, vars?: Record<string, string>) => string;
type Payment = {
  enabled: boolean; bankAccess: boolean; state: string; conflict: boolean; channel: string | null; note: string | null; amountMismatch: boolean;
  matches: { id: string; amountCzk: number; setPaidToAuthor: boolean; date: string; amount: number; counterparty?: string | null }[];
};
type Candidate = { id: string; bookingDate: string; amount: number; counterpartyName: string | null; message: string | null; remaining: number };
const btn = "rounded-lg border border-mist bg-paper-2 px-2.5 py-1 text-[13px] text-ink hover:bg-mist disabled:opacity-50";

export default function BillPaymentBox({ billId, eventId, locked, t }: { billId: string; eventId: string; locked: boolean; t: T }) {
  const confirm = useConfirm();
  const [p, setP] = useState<Payment | null>(null);
  const [picking, setPicking] = useState(false);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/bills/${billId}/payment`).then((r) => (r.ok ? r.json() : null)).then((d) => { setP(d); setNote(d?.note ?? ""); }).catch(() => {});
  }, [billId]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!picking) return;
    fetch(`/api/bills/${billId}/payment/transactions?q=${encodeURIComponent(q)}`).then((r) => (r.ok ? r.json() : [])).then(setCands).catch(() => {});
  }, [picking, q, billId]);

  if (!p?.enabled) return null;

  async function setChannel(channel: string | null) {
    await fetch(`/api/bills/${billId}/payment`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, note }) });
    load();
  }
  async function pairWith(c: Candidate, reason?: string) {
    const r = await fetch(`/api/events/${eventId}/bank/pairing/${c.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ billIds: [billId], differenceReason: reason ?? null }) });
    const d = await r.json().catch(() => ({}));
    if (d.error === "reason_required") {
      // The payment differs from the bill: ask which kind of difference.
      const reasons = ["fx", "fee", "rounding", "partial"];
      for (const x of reasons) if (await confirm({ message: t("billPayment.differenceAsk", { diff: kc(d.difference), reason: t(`bankDiff.${x}`) }) })) return pairWith(c, x);
      return;
    }
    if (!r.ok) return setMsg(t(`bankPairing.error.${d.error ?? "failed"}`));
    setPicking(false);
    load();
  }
  async function unpair(m: Payment["matches"][number]) {
    if (!(await confirm({ message: t("bankTx.unpairConfirm", { amount: kc(m.amountCzk) }), danger: true }))) return;
    const clearPaid = m.setPaidToAuthor ? await confirm({ message: t("bankTx.unpairClearPaid") }) : false;
    await fetch(`/api/events/${eventId}/bank/matches/${m.id}?clearPaid=${clearPaid ? 1 : 0}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="rounded-lg border border-mist p-3 text-[13px]">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-ink">{t("billPayment.title")}</span>
        <span className={"rounded-full px-2 py-0.5 text-[12px] " + (p.state === "bank" || p.state === "cash" || p.state === "other_account" ? "bg-pine-bg text-pine" : "bg-paper-2 text-ink-secondary")}>
          {t(`paymentState.${p.state}`)}{p.conflict && " ⚠"}
        </span>
      </div>
      {p.conflict && <p className="mb-1 text-amber-700">{t("billPayment.conflict")}</p>}
      {p.amountMismatch && <p className="mb-1 text-amber-700">{t("billPayment.mismatch")}</p>}
      {p.matches.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-2 border-b border-mist/60 py-1">
          <span>{dmy(m.date)} · {kc(m.amount)} Kč{m.counterparty ? ` · ${m.counterparty}` : ""}{Math.abs(Math.abs(m.amount) - m.amountCzk) > 0.005 && ` (${t("billPayment.allocated", { amount: kc(m.amountCzk) })})`}</span>
          {p.bankAccess && !locked && <button type="button" className="text-ink-secondary hover:text-red-600" onClick={() => unpair(m)} aria-label={t("bankTx.unpair")}>✕</button>}
        </div>
      ))}
      {p.channel && <p className="text-ink-secondary">{t(`paymentState.${p.channel}`)}{p.note && ` · ${p.note}`}</p>}
      {!locked && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {p.bankAccess && <button type="button" className={btn} onClick={() => setPicking(!picking)}>{t("billPayment.pick")}</button>}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("billPayment.notePlaceholder")} className="w-40 rounded-lg border border-mist bg-paper-2 px-2 py-1" />
          <button type="button" className={btn} onClick={() => setChannel("cash")}>{t("paymentState.cash")}</button>
          <button type="button" className={btn} onClick={() => setChannel("other_account")}>{t("paymentState.other_account")}</button>
          {p.channel && <button type="button" className="text-ink-secondary hover:underline" onClick={() => setChannel(null)}>{t("billPayment.clear")}</button>}
        </div>
      )}
      {picking && (
        <div className="mt-2 rounded-lg border border-mist bg-paper-2 p-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("bankPairing.search")} className="mb-1 w-full rounded border border-mist bg-paper px-2 py-1" />
          {cands.length === 0 && <p className="text-ink-secondary">{t("billPayment.noCandidates")}</p>}
          {cands.map((c) => (
            <button key={c.id} type="button" onClick={() => pairWith(c)} className="flex w-full justify-between gap-2 border-b border-mist/60 py-1 text-left hover:bg-paper">
              <span>{dmy(c.bookingDate)} · {c.counterpartyName ?? c.message ?? "—"}</span>
              <span className="tabular-nums">{kc(c.remaining)}</span>
            </button>
          ))}
        </div>
      )}
      {msg && <p className="mt-1 text-red-600">{msg}</p>}
    </div>
  );
}
