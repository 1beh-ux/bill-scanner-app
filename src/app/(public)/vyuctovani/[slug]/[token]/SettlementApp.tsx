"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildSpaydString, czechAccountToIban } from "@/lib/qr-platba";
import type { Statement } from "@/lib/settlement-statement";

// The person's statement: what was counted, the result, a QR to pay (event / person to person) and the
// confirmations. Czech texts from settlementPage.* ({x} placeholders).
const czk = (n: number) => `${n.toLocaleString("cs-CZ", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Kč`;
const date = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("cs-CZ", { timeZone: "UTC" }) : "");
const btn = "rounded-lg border border-mist bg-paper px-3 py-1.5 text-[14px] text-ink hover:bg-paper-2 disabled:opacity-50";
const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[15px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

export default function SettlementApp({ token, strings }: { token: string; strings: Record<string, string> }) {
  const t = (k: string, vars: Record<string, string> = {}) => Object.entries(vars).reduce((s, [a, b]) => s.replaceAll(`{${a}}`, b), strings[`settlementPage.${k}`] ?? k);
  const [s, setS] = useState<Statement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const api = `/api/public/vyuctovani/${token}`;
  const load = useCallback(async () => {
    const r = await fetch(api, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setS(await r.json());
    else setError(t("notFound"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load
    load();
  }, [load]);
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const r = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (r?.ok) setS(await r.json());
    else setError(t(r?.status === 429 ? "throttled" : "failed"));
  }

  const fileLink = (kind: "official" | "personal", id: string) => (
    <a href={`${api}/file?kind=${kind}&id=${id}`} target="_blank" rel="noreferrer" className="ml-1.5 text-[12px] text-ember underline">
      {t("viewBill")}
    </a>
  );

  if (error && !s) return <p className="p-8 text-center text-[15px]">{error}</p>;
  if (!s) return <p className="p-8 text-center text-[15px] text-ink-secondary">…</p>;
  const r = s.result;
  // Open items above; what is paid / paid out / settled in "Již zaplaceno".
  const officialOpen = s.official.filter((b) => b.state !== "paid");
  const officialPaid = s.official.filter((b) => b.state === "paid");
  const ownOpen = s.own.filter((o) => !o.settled);
  const ownPaid = s.own.filter((o) => o.settled);
  const othersOpen = s.paidForOthers.filter((o) => !o.paidOut);
  const othersPaid = s.paidForOthers.filter((o) => o.paidOut);
  const owes = r.net < -0.004;
  const getsPaid = r.net > 0.004;
  // Only person-to-person payments: no "nothing to pay" box above them.
  const showResult = owes || getsPaid || s.status.paidOut || !!s.status.claimedAt || (!s.iOwe.length && !s.owedToMe.length);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-3 py-4 sm:px-6 md:p-8">
      <header>
        <p className="text-[13px] text-ink-secondary">{s.event.organization}</p>
        <h1 className="text-[22px] font-semibold">{s.event.name}</h1>
        <p className="text-[13px] text-ink-secondary">
          {date(s.event.startDate)} – {date(s.event.endDate)} · {t("title", { name: s.person.name })}
        </p>
      </header>

      {/* The result first: what to do. */}
      {showResult && (
      <section className={"rounded-xl border p-4 " + (owes ? "border-ember/50 bg-ember/5" : "border-mist bg-paper-2")}>
        {owes ? (
          <PayBox
            amount={-r.net}
            to={s.receiver}
            vs={s.variableSymbol}
            message={`${s.person.name} ${s.event.name}`}
            claimedAt={s.status.claimedAt ? String(s.status.claimedAt) : null}
            busy={busy}
            t={t}
            onClaim={(on) => act({ action: on ? "paid" : "unpaid" })}
            onCheck={s.variableSymbol ? () => act({ action: "check" }) : null}
            title={t("youPayEvent", { amount: czk(-r.net) })}
          />
        ) : getsPaid ? (
          <div className="flex flex-col gap-2">
            <p className="text-[18px] font-semibold">{t("eventPaysYou", { amount: czk(r.net) })}</p>
            {/* "Souhlasím s vyúčtováním": valid while the amount is the one they accepted. */}
            {s.status.acceptedAt && s.status.acceptedAmount != null && Math.abs(s.status.acceptedAmount - r.net) < 0.005 ? (
              <p className="flex flex-wrap items-center gap-2 text-[14px] text-pine">
                ✓ {t("accepted", { date: new Date(String(s.status.acceptedAt)).toLocaleDateString("cs-CZ") })}
                <button type="button" disabled={busy} onClick={() => act({ action: "unaccept" })} className="text-[13px] text-ink-secondary underline">
                  {t("undo")}
                </button>
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {s.status.acceptedAt && <p className="text-[13px] text-amber-700">{t("acceptedChanged", { amount: czk(s.status.acceptedAmount ?? 0) })}</p>}
                <button type="button" disabled={busy} onClick={() => act({ action: "accept" })} className={btnPrimary + " self-start"}>
                  {t("accept", { amount: czk(r.net) })}
                </button>
                <p className="text-[12px] text-ink-secondary">{t("acceptHint")}</p>
              </div>
            )}
            <BankBox s={s} busy={busy} t={t} onSave={(account, code) => act({ action: "bank", account, code })} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[18px] font-semibold">{s.status.paidOut || s.status.claimedAt ? t("settled") : t("even")}</p>
            {s.status.paidOut && (
              <p className="flex flex-wrap items-center gap-2 text-[14px]">
                {s.status.receivedAt ? (
                  <>
                    ✓ {t("receivedConfirmed", { date: new Date(String(s.status.receivedAt)).toLocaleDateString("cs-CZ") })}
                    <button type="button" disabled={busy} onClick={() => act({ action: "unreceived" })} className="text-[13px] text-ink-secondary underline">
                      {t("undo")}
                    </button>
                  </>
                ) : (
                  <button type="button" disabled={busy} onClick={() => act({ action: "received" })} className={btnPrimary}>
                    {t("iReceived")}
                  </button>
                )}
              </p>
            )}
          </div>
        )}
        {(r.official > 0 || r.personalIn > 0 || r.personalOut > 0) && (
          <table className="mt-3 w-full text-[14px]">
            <tbody>
              {r.official > 0 && <Row label={t("rowOfficial")} value={`+ ${czk(r.official)}`} />}
              {r.personalIn > 0 && <Row label={t("rowPaidForOthers")} value={`+ ${czk(r.personalIn)}`} />}
              {r.personalOut > 0 && <Row label={t("rowOwn")} value={`− ${czk(r.personalOut)}`} />}
              <Row label={t("rowResult")} value={czk(r.net)} strong />
            </tbody>
          </table>
        )}
      </section>
      )}

      {s.iOwe.map((d) => (
        <section key={d.creditorId} className="rounded-xl border border-mist p-4">
          <PayBox
            amount={d.amountCzk}
            to={{ name: d.name, bankAccountNumber: d.bankAccountNumber, bankCode: d.bankCode, autoConfirm: d.autoConfirm }}
            vs={d.variableSymbol}
            message={`${s.person.name} ${s.event.name}`}
            claimedAt={d.claimedAt}
            busy={busy}
            t={t}
            onClaim={(on) => act({ action: on ? "pairPaid" : "pairUnpaid", creditorId: d.creditorId })}
            onCheck={d.autoConfirm ? () => act({ action: "check" }) : null}
            title={t("youOwePerson", { name: d.name, amount: czk(d.amountCzk) })}
          />
        </section>
      ))}
      {s.owedToMe.map((d) => (
        <section key={d.debtorId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-mist p-4 text-[15px]">
          <span>
            {t("personOwesYou", { name: d.name, amount: czk(d.amountCzk) })}
            {d.claimedAt && <span className="block text-[13px] text-amber-700">{t("theyClaimPaid", { date: new Date(d.claimedAt).toLocaleDateString("cs-CZ") })}</span>}
          </span>
          <button type="button" disabled={busy} onClick={() => act({ action: "pairReceived", debtorId: d.debtorId })} className={btn}>
            {t("iReceivedFrom", { name: d.name })}
          </button>
        </section>
      ))}

      {officialOpen.length > 0 && (
        <section>
          <h2 className="mb-1 text-[16px] font-semibold">{t("officialTitle")}</h2>
          <p className="mb-2 text-[12.5px] text-ink-secondary">{t("officialHint")}</p>
          <table className="w-full text-[14px]">
            <tbody>
              {officialOpen.map((b, i) => (
                <tr key={i} className="border-b border-mist/60">
                  <td className="hidden whitespace-nowrap py-1.5 pr-3 align-top text-ink-secondary sm:table-cell">{date(b.date)}</td>
                  <td className="py-1.5 align-top [overflow-wrap:anywhere]">
                    {b.merchant || "—"}
                    {b.hasFile && fileLink("official", b.billId)}
                    <span className="block text-[12px] text-ink-secondary sm:hidden">
                      {date(b.date)} · {t(`state.${b.state}`)}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap py-1.5 pr-3 align-top text-[12px] text-ink-secondary sm:table-cell">{t(`state.${b.state}`)}</td>
                  <td className="whitespace-nowrap py-1.5 pl-3 text-right align-top tabular-nums">{czk(b.amountCzk)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {ownOpen.length > 0 && (
        <section>
          <h2 className="mb-1 text-[16px] font-semibold">{t("ownTitle")}</h2>
          <div className="flex flex-col gap-2">
            {ownOpen.map((o, i) => (
              <div key={i} className="rounded-lg border border-mist/60 p-2 text-[14px]">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {o.title || "—"} <span className="text-[12px] text-ink-secondary">· {date(o.date)}</span>
                    {o.hasFile && fileLink("personal", o.billId)}
                  </span>
                  <span className="shrink-0 whitespace-nowrap font-medium tabular-nums">{czk(o.amountCzk)}</span>
                </div>
                <div className="text-[12.5px] text-ink-secondary">
                  {o.quantity != null && o.unitPrice != null && `${o.quantity} × ${czk(o.unitPrice)} · `}
                  {o.of && o.billTotal != null && `${t("evenPart", { n: String(o.of), total: czk(o.billTotal) })} · `}
                  {o.mine ? t("ownPartMine") : o.paidBy ? t("paidBy", { name: o.paidBy }) : t("paidByEvent")}
                  {" · "}
                  {o.via === "event" ? t("viaEvent") : t("direct")}
                  {o.settled && ` · ✓ ${t("partSettled")}`}
                </div>
                {o.lines.length > 0 && (
                  <ul className="mt-1 text-[12.5px] text-ink-secondary">
                    {o.lines.map((l, k) => (
                      <li key={k} className="flex justify-between gap-3">
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                          {l.description || "—"}
                          {l.people > 1 && ` (${czk(l.total)} / ${l.people})`}
                        </span>
                        <span className="shrink-0 whitespace-nowrap tabular-nums">{czk(l.share)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {othersOpen.length > 0 && (
        <section>
          <h2 className="mb-1 text-[16px] font-semibold">{t("othersTitle")}</h2>
          <div className="flex flex-col gap-2">
            {othersOpen.map((o, i) => (
              <div key={i} className="rounded-lg border border-mist/60 p-2 text-[14px]">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    <b>{o.debtor}</b>: {o.title || "—"} <span className="text-[12px] text-ink-secondary">· {date(o.date)}</span>
                    {o.hasFile && fileLink("personal", o.billId)}
                  </span>
                  <span className="shrink-0 whitespace-nowrap font-medium tabular-nums">{czk(o.amountCzk)}</span>
                </div>
                {(o.quantity != null && o.unitPrice != null) || o.of || o.paidOut ? (
                  <div className="text-[12.5px] text-ink-secondary">
                    {o.quantity != null && o.unitPrice != null && `${o.quantity} × ${czk(o.unitPrice)}`}
                    {o.of && o.billTotal != null && t("evenPart", { n: String(o.of), total: czk(o.billTotal) })}
                    {o.paidOut && `${o.quantity != null || o.of ? " · " : ""}✓ ${t("partSettled")}`}
                  </div>
                ) : null}
                {o.lines.length > 0 && (
                  <ul className="mt-1 text-[12.5px] text-ink-secondary">
                    {o.lines.map((l, k) => (
                      <li key={k} className="flex justify-between gap-3">
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                          {l.description || "—"}
                          {l.people > 1 && ` (${czk(l.total)} / ${l.people})`}
                        </span>
                        <span className="shrink-0 whitespace-nowrap tabular-nums">{czk(l.share)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {/* What is already paid / settled: apart, with the same detail -- a longer event may be settled twice. */}
      {(officialPaid.length > 0 || ownPaid.length > 0 || othersPaid.length > 0) && (
        <section className="flex flex-col gap-4 rounded-xl border border-pine/30 bg-pine/5 p-3">
          <h2 className="text-[16px] font-semibold text-pine">✓ {t("paidTitle")}</h2>
      {officialPaid.length > 0 && (
        <section>
          <h3 className="mb-1 text-[14px] font-semibold text-ink-secondary">{t("officialTitle")}</h3>
          <p className="mb-2 text-[12.5px] text-ink-secondary">{t("officialHint")}</p>
          <table className="w-full text-[14px]">
            <tbody>
              {officialPaid.map((b, i) => (
                <tr key={i} className="border-b border-mist/60">
                  <td className="hidden whitespace-nowrap py-1.5 pr-3 align-top text-ink-secondary sm:table-cell">{date(b.date)}</td>
                  <td className="py-1.5 align-top [overflow-wrap:anywhere]">
                    {b.merchant || "—"}
                    {b.hasFile && fileLink("official", b.billId)}
                    <span className="block text-[12px] text-ink-secondary sm:hidden">
                      {date(b.date)} · {t(`state.${b.state}`)}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap py-1.5 pr-3 align-top text-[12px] text-ink-secondary sm:table-cell">{t(`state.${b.state}`)}</td>
                  <td className="whitespace-nowrap py-1.5 pl-3 text-right align-top tabular-nums">{czk(b.amountCzk)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {ownPaid.length > 0 && (
        <section>
          <h3 className="mb-1 text-[14px] font-semibold text-ink-secondary">{t("ownTitle")}</h3>
          <div className="flex flex-col gap-2">
            {ownPaid.map((o, i) => (
              <div key={i} className="rounded-lg border border-mist/60 p-2 text-[14px]">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {o.title || "—"} <span className="text-[12px] text-ink-secondary">· {date(o.date)}</span>
                    {o.hasFile && fileLink("personal", o.billId)}
                  </span>
                  <span className="shrink-0 whitespace-nowrap font-medium tabular-nums">{czk(o.amountCzk)}</span>
                </div>
                <div className="text-[12.5px] text-ink-secondary">
                  {o.quantity != null && o.unitPrice != null && `${o.quantity} × ${czk(o.unitPrice)} · `}
                  {o.of && o.billTotal != null && `${t("evenPart", { n: String(o.of), total: czk(o.billTotal) })} · `}
                  {o.mine ? t("ownPartMine") : o.paidBy ? t("paidBy", { name: o.paidBy }) : t("paidByEvent")}
                  {" · "}
                  {o.via === "event" ? t("viaEvent") : t("direct")}
                  {o.settled && ` · ✓ ${t("partSettled")}`}
                </div>
                {o.lines.length > 0 && (
                  <ul className="mt-1 text-[12.5px] text-ink-secondary">
                    {o.lines.map((l, k) => (
                      <li key={k} className="flex justify-between gap-3">
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                          {l.description || "—"}
                          {l.people > 1 && ` (${czk(l.total)} / ${l.people})`}
                        </span>
                        <span className="shrink-0 whitespace-nowrap tabular-nums">{czk(l.share)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {othersPaid.length > 0 && (
        <section>
          <h3 className="mb-1 text-[14px] font-semibold text-ink-secondary">{t("othersTitle")}</h3>
          <div className="flex flex-col gap-2">
            {othersPaid.map((o, i) => (
              <div key={i} className="rounded-lg border border-mist/60 p-2 text-[14px]">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    <b>{o.debtor}</b>: {o.title || "—"} <span className="text-[12px] text-ink-secondary">· {date(o.date)}</span>
                    {o.hasFile && fileLink("personal", o.billId)}
                  </span>
                  <span className="shrink-0 whitespace-nowrap font-medium tabular-nums">{czk(o.amountCzk)}</span>
                </div>
                {(o.quantity != null && o.unitPrice != null) || o.of || o.paidOut ? (
                  <div className="text-[12.5px] text-ink-secondary">
                    {o.quantity != null && o.unitPrice != null && `${o.quantity} × ${czk(o.unitPrice)}`}
                    {o.of && o.billTotal != null && t("evenPart", { n: String(o.of), total: czk(o.billTotal) })}
                    {o.paidOut && `${o.quantity != null || o.of ? " · " : ""}✓ ${t("partSettled")}`}
                  </div>
                ) : null}
                {o.lines.length > 0 && (
                  <ul className="mt-1 text-[12.5px] text-ink-secondary">
                    {o.lines.map((l, k) => (
                      <li key={k} className="flex justify-between gap-3">
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                          {l.description || "—"}
                          {l.people > 1 && ` (${czk(l.total)} / ${l.people})`}
                        </span>
                        <span className="shrink-0 whitespace-nowrap tabular-nums">{czk(l.share)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
        </section>
      )}
      {error && <p className="text-[14px] text-red-600">{error}</p>}
      <p className="text-[12px] text-ink-secondary">{t("footer")}</p>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr className={strong ? "border-t border-mist font-semibold" : ""}>
      <td className="py-0.5">{label}</td>
      <td className="whitespace-nowrap py-0.5 pl-3 text-right tabular-nums">{value}</td>
    </tr>
  );
}

/** Where the event's payout goes: their account, changeable here (shown to the treasurer as "recently changed"). */
function BankBox({ s, busy, t, onSave }: { s: Statement; busy: boolean; t: (k: string, v?: Record<string, string>) => string; onSave: (account: string, code: string) => void }) {
  const [edit, setEdit] = useState(!s.person.bankAccountNumber);
  const [account, setAccount] = useState(s.person.bankAccountNumber ?? "");
  const [code, setCode] = useState(s.person.bankCode ?? "");
  if (!edit)
    return (
      <p className="text-[14px]">
        {t("payoutTo")} <b>{s.person.bankAccountNumber}/{s.person.bankCode}</b>{" "}
        <button type="button" onClick={() => setEdit(true)} className="text-[13px] text-ember underline">
          {t("change")}
        </button>
      </p>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(account, code);
        setEdit(false);
      }}
      className="flex flex-wrap items-center gap-2 text-[14px]"
    >
      <span>{t("payoutAccount")}</span>
      <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="123456789" inputMode="numeric" className="w-40 rounded-lg border border-mist bg-paper px-2 py-1.5" />
      /
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="2010" inputMode="numeric" className="w-20 rounded-lg border border-mist bg-paper px-2 py-1.5" />
      <button type="submit" disabled={busy || !account || !code} className={btn}>
        {t("save")}
      </button>
    </form>
  );
}

/** Pay someone: the amount, a Czech QR payment, the account / VS to copy, "Zaplatil(a) jsem". */
function PayBox(p: {
  amount: number;
  to: { name: string; bankAccountNumber: string | null; bankCode: string | null; autoConfirm: boolean } | null;
  vs: string | null;
  message: string;
  claimedAt: string | null;
  busy: boolean;
  t: (k: string, v?: Record<string, string>) => string;
  onClaim: (on: boolean) => void;
  onCheck: (() => void) | null;
  title: string;
}) {
  const { t } = p;
  const [qr, setQr] = useState<string | null>(null);
  const iban = p.to?.bankAccountNumber && p.to.bankCode ? czechAccountToIban(p.to.bankAccountNumber, p.to.bankCode) : null;
  const message = p.message.normalize("NFD").replace(/[̀-ͯ]/g, "").slice(0, 60);
  useEffect(() => {
    if (!iban) return;
    QRCode.toDataURL(buildSpaydString(iban, Math.round(p.amount * 100) / 100, message, p.vs ?? undefined), { margin: 1, width: 240 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [iban, p.amount, message, p.vs]);
  const copy = (v: string) => navigator.clipboard?.writeText(v).catch(() => {});
  async function share() {
    if (!qr) return;
    const blob = await (await fetch(qr)).blob();
    const file = new File([blob], "qr-platba.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: p.title }).catch(() => {});
    else {
      const a = document.createElement("a");
      a.href = qr;
      a.download = "qr-platba.png";
      a.click();
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[18px] font-semibold">{p.title}</p>
      {!iban ? (
        <p className="text-[14px] text-amber-800">{t("noAccount", { name: p.to?.name ?? "" })}</p>
      ) : (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt="QR Platba" width={240} height={240} className="h-auto w-[240px] max-w-full shrink-0 rounded-lg bg-white p-1" />}
          <div className="flex flex-col gap-1.5 text-[14px]">
            <span>
              {t("to")} <b>{p.to!.name}</b>
            </span>
            <span className="flex flex-wrap items-center gap-x-2">
              {t("account")} <b className="tabular-nums">{p.to!.bankAccountNumber}/{p.to!.bankCode}</b>
              <button type="button" onClick={() => copy(`${p.to!.bankAccountNumber}/${p.to!.bankCode}`)} className="text-[12px] text-ember underline">
                {t("copy")}
              </button>
            </span>
            {p.vs && (
              <span className="flex flex-wrap items-center gap-x-2">
                {t("vs")} <b className="tabular-nums">{p.vs}</b>
                <button type="button" onClick={() => copy(p.vs!)} className="text-[12px] text-ember underline">
                  {t("copy")}
                </button>
              </span>
            )}
            <span>
              {t("amount")} <b>{czk(p.amount)}</b>
            </span>
            <button type="button" onClick={share} className={btn + " self-start"}>
              {t("shareQr")}
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        {p.claimedAt ? (
          <>
            <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-800">{t("claimed", { date: new Date(p.claimedAt).toLocaleDateString("cs-CZ") })}</span>
            <button type="button" disabled={p.busy} onClick={() => p.onClaim(false)} className="text-[13px] text-ink-secondary underline">
              {t("undo")}
            </button>
          </>
        ) : (
          <button type="button" disabled={p.busy} onClick={() => p.onClaim(true)} className={btnPrimary}>
            {t("iPaid")}
          </button>
        )}
        {p.onCheck && (
          <button type="button" disabled={p.busy} onClick={p.onCheck} className={btn}>
            {t("checkPayment")}
          </button>
        )}
      </div>
      <p className="text-[12px] text-ink-secondary">{p.vs ? t("autoHint") : t("manualHint")}</p>
    </div>
  );
}
