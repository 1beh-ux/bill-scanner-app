"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "@/lib/i18n";
import { useConfirm } from "@/components/ConfirmDialog";
import BankHeader from "@/components/bank/BankHeader";
import { dmy, kc, reasonText, type Reason } from "@/components/bank/bank-format";

// Banka -> Párování (docs/bank-reconciliation.md A7): left the payments to pair, right the candidates
// for the selected one; tick bills, see the difference, Spárovat (Enter) -> next payment.
type Bill = { id: string; eventId: string; merchantName: string | null; billDate: string | null; amountCzk: number | null; totalAmount: number | null; currency: string; notes: string | null; originalFilename: string; status: string; documentMissing: boolean; remaining: number; eventName?: string };
type Cand = {
  tx: { id: string; bookingDate: string; amount: number; counterpartyName: string | null; message: string | null; vs: string | null; bankType: string | null; originalAmount: number | null; originalCurrency: string | null };
  confirmed: { id: string; amountCzk: number; setPaidToAuthor: boolean; bill: Bill }[];
  suggestions: { id: string; tier: "sure" | "possible"; reasons: Reason[]; amountCzk: number; bill: Bill }[];
  bills: Bill[];
  otherBills: Bill[];
  reimbursement: { author: { id: string; canonicalName: string }; billIds: string[] } | null;
};
type Tx = { id: string; bookingDate: string; amount: number; counterpartyName: string | null; message: string | null; reimbursementOf: string | null; matches: { confirmedAt: string | null }[] };
const btn = "rounded-lg border border-mist bg-paper-2 px-2.5 py-1 text-[13px] text-ink hover:bg-mist disabled:opacity-50";

function Pairing({ id }: { id: string }) {
  const { t } = useTranslations();
  const confirm = useConfirm();
  const sp = useSearchParams();
  const [list, setList] = useState<Tx[]>([]);
  const [current, setCurrent] = useState<string | null>(sp.get("tx"));
  const [cand, setCand] = useState<Cand | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [other, setOther] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const loadList = useCallback(async () => {
    const r = await fetch(`/api/events/${id}/bank/transactions?tab=todo&cls=expense`);
    if (r.status === 403) return setDenied(true);
    const d = r.ok ? await r.json() : { rows: [] };
    setList(d.rows);
    setCurrent((c) => c ?? d.rows[0]?.id ?? null);
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    loadList();
  }, [loadList]);

  const loadCand = useCallback(async () => {
    if (!current) return setCand(null);
    const r = await fetch(`/api/events/${id}/bank/pairing/${current}?${new URLSearchParams({ q, ...(other && { other: "1" }) })}`);
    if (!r.ok) return setCand(null);
    const d: Cand = await r.json();
    setCand(d);
    // A payment to a payer: their unreimbursed bills ticked.
    setTicked((prev) => (prev.size ? prev : new Set(d.reimbursement?.billIds ?? [])));
  }, [id, current, q, other]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload candidates for the selected payment
    loadCand();
  }, [loadCand]);

  const all = useMemo(() => {
    const m = new Map<string, Bill>();
    for (const b of [...(cand?.suggestions.map((s) => s.bill) ?? []), ...(cand?.bills ?? []), ...(cand?.otherBills ?? [])]) m.set(b.id, b);
    return m;
  }, [cand]);
  const payment = cand ? Math.abs(cand.tx.amount) - cand.confirmed.reduce((s, m) => s + m.amountCzk, 0) : 0;
  const chosen = [...ticked].map((x) => all.get(x)).filter((b): b is Bill => !!b && b.eventId === id);
  const sum = chosen.reduce((s, b) => s + b.remaining, 0);
  const diff = Math.round((sum - payment) * 100) / 100;

  function select(txId: string) {
    setCurrent(txId);
    setTicked(new Set());
    setReason("");
    setMsg(null);
  }
  async function pair() {
    if (!cand || !chosen.length) return;
    if (Math.abs(diff) > 0.005 && !reason) return setMsg(t("bankPairing.reasonRequired"));
    const r = await fetch(`/api/events/${id}/bank/pairing/${cand.tx.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ billIds: chosen.map((b) => b.id), differenceReason: reason || null }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(t(`bankPairing.error.${d.error ?? "failed"}`));
    const idx = list.findIndex((x) => x.id === cand.tx.id);
    const next = list[idx + 1]?.id ?? null;
    setMsg(t("bankPairing.done", { count: String(d.paired), paid: String(d.markedPaid ?? 0) }));
    await loadList();
    select(next ?? "");
    if (!next) setCurrent(null);
  }
  async function moveHere(b: Bill) {
    if (!cand || !(await confirm({ message: t("bankPairing.moveConfirm", { name: b.merchantName ?? b.originalFilename, event: b.eventName ?? "" }) }))) return;
    const r = await fetch(`/api/events/${id}/bank/pairing/${cand.tx.id}/move-bill`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ billId: b.id }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(t(`billModal.error.${d.error}`) || t("bankPairing.error.failed"));
    setTicked((s) => new Set(s).add(b.id));
    loadCand();
  }
  async function unpair(m: Cand["confirmed"][number]) {
    if (!(await confirm({ message: t("bankTx.unpairConfirm", { amount: kc(m.amountCzk) }), danger: true }))) return;
    const clearPaid = m.setPaidToAuthor ? await confirm({ message: t("bankTx.unpairClearPaid") }) : false;
    await fetch(`/api/events/${id}/bank/matches/${m.id}?clearPaid=${clearPaid ? 1 : 0}`, { method: "DELETE" });
    loadCand();
    loadList();
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes((e.target as HTMLElement).tagName)) return;
      e.preventDefault();
      pair();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (denied) return <div className="p-8 text-[14px] text-ink-secondary">{t("bank.noAccess")}</div>;

  const billRow = (b: Bill, extra?: React.ReactNode) => (
    <label key={b.id} className="flex cursor-pointer items-start gap-2 border-b border-mist/60 py-1.5 text-[13px]">
      <input type="checkbox" className="mt-0.5" disabled={b.eventId !== id} checked={ticked.has(b.id)} onChange={(e) => setTicked((s) => { const n = new Set(s); if (e.target.checked) n.add(b.id); else n.delete(b.id); return n; })} />
      <span className="flex-1">
        <a href={`/events/${b.eventId}/bills/${b.id}`} target="_blank" rel="noreferrer" className="font-medium text-ink hover:underline">{b.merchantName ?? b.originalFilename}</a>
        {b.documentMissing && <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] text-amber-800">{t("bankPairing.noDocBadge")}</span>}
        <span className="block text-[12px] text-ink-secondary">{dmy(b.billDate)}{b.currency !== "CZK" && b.totalAmount !== null && ` · ${kc(b.totalAmount)} ${b.currency}`}{b.notes && ` · ${b.notes.slice(0, 60)}`}{b.eventName && ` · ${b.eventName}`}</span>
        {extra}
      </span>
      <span className="tabular-nums">{kc(b.remaining)}</span>
    </label>
  );

  return (
    <div className="mx-auto max-w-[1400px] p-4 md:p-8">
      <BankHeader title={t("bankNav.pairing")} />
      {msg && <p className="mb-2 text-[13px] text-ink">{msg}</p>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="max-h-[75vh] overflow-y-auto rounded-lg border border-mist">
          {list.length === 0 && <p className="p-3 text-[13px] text-ink-secondary">{t("bankPairing.nothing")}</p>}
          {list.map((x) => (
            <button key={x.id} type="button" onClick={() => select(x.id)} className={"flex w-full items-start justify-between gap-2 border-b border-mist/60 px-3 py-2 text-left text-[13px] " + (x.id === current ? "bg-paper-2" : "hover:bg-paper-2/60")}>
              <span>
                <span className="text-ink">{x.counterpartyName ?? x.message ?? "—"}</span>
                <span className="block text-[12px] text-ink-secondary">{dmy(x.bookingDate)}{x.reimbursementOf && ` · ${t("bankTx.reimbursement", { name: x.reimbursementOf })}`}</span>
              </span>
              <span className="tabular-nums">{kc(x.amount)}</span>
            </button>
          ))}
        </div>

        <div>
          {!cand ? (
            <p className="text-[13px] text-ink-secondary">{current ? t("common.loading") : t("bankPairing.pick")}</p>
          ) : (
            <>
              <div className="mb-3 rounded-lg border border-mist bg-paper-2 p-3 text-[13px]">
                <div className="flex justify-between text-[15px] font-semibold text-ink"><span>{cand.tx.counterpartyName ?? "—"}</span><span className="tabular-nums">{kc(cand.tx.amount)}</span></div>
                <p className="text-ink-secondary">{dmy(cand.tx.bookingDate)} · {[cand.tx.bankType, cand.tx.message, cand.tx.vs && `VS ${cand.tx.vs}`].filter(Boolean).join(" · ")}{cand.tx.originalCurrency && cand.tx.originalAmount !== null && ` · ${kc(cand.tx.originalAmount)} ${cand.tx.originalCurrency}`}</p>
                {cand.reimbursement && <p className="mt-1 text-pine">{t("bankPairing.reimbursementHint", { name: cand.reimbursement.author.canonicalName })}</p>}
                {cand.confirmed.length > 0 && (
                  <p className="mt-1">
                    {t("bankPairing.alreadyPaired")}{" "}
                    {cand.confirmed.map((m) => (
                      <span key={m.id} className="mr-1 inline-flex items-center gap-1 rounded-full bg-pine-bg px-2 py-0.5 text-[11.5px] text-pine">
                        {m.bill.merchantName ?? m.bill.originalFilename} · {kc(m.amountCzk)}
                        <button type="button" onClick={() => unpair(m)} aria-label={t("bankTx.unpair")}>✕</button>
                      </span>
                    ))}
                  </p>
                )}
              </div>

              {cand.suggestions.length > 0 && (
                <>
                  <h3 className="mb-1 text-[13px] font-semibold text-ink">{t("bankPairing.suggestions")}</h3>
                  {cand.suggestions.map((s) => billRow(s.bill, <span className="block text-[11.5px] text-ink-secondary">{t(`bankTier.${s.tier}`)} · {s.reasons.map((r) => reasonText(r, t)).join(", ")}</span>))}
                </>
              )}
              <div className="mb-1 mt-3 flex flex-wrap items-center gap-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("bankPairing.search")} className="flex-1 rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px]" />
                <label className="flex items-center gap-1 text-[13px] text-ink-secondary"><input type="checkbox" checked={other} onChange={(e) => setOther(e.target.checked)} />{t("bankPairing.otherEvents")}</label>
              </div>
              <div className="max-h-[40vh] overflow-y-auto">
                {cand.bills.filter((b) => !cand.suggestions.some((s) => s.bill.id === b.id)).map((b) => billRow(b))}
                {other && cand.otherBills.map((b) => billRow(b, <button type="button" onClick={(e) => { e.preventDefault(); moveHere(b); }} className="text-[12px] text-ember hover:underline">{t("bankPairing.moveHere")}</button>))}
              </div>

              <div className="sticky bottom-0 mt-3 flex flex-wrap items-center gap-2 border-t border-mist bg-paper py-2 text-[13px]">
                <span className={Math.abs(diff) < 0.005 && chosen.length ? "text-pine" : "text-ink"}>
                  {t("bankPairing.bar", { chosen: kc(sum), payment: kc(payment), diff: kc(diff) })} {Math.abs(diff) < 0.005 && chosen.length > 0 && "✓"}
                </span>
                {Math.abs(diff) > 0.005 && chosen.length > 0 && (
                  <select value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-lg border border-mist bg-paper-2 px-2 py-1">
                    <option value="">{t("bankPairing.reason")}</option>
                    {["fx", "fee", "rounding", "partial"].map((r) => <option key={r} value={r}>{t(`bankDiff.${r}`)}</option>)}
                  </select>
                )}
                <button type="button" className="ml-auto rounded-lg bg-ember px-3 py-1.5 font-medium text-white hover:bg-ember-hover disabled:opacity-50" disabled={!chosen.length} onClick={pair}>{t("bankPairing.pair")}</button>
                <a href={`/events/${id}/bank/transactions`} className={btn}>{t("bankNav.transactions")}</a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <Pairing id={id} />
    </Suspense>
  );
}
