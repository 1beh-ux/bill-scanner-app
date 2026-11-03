"use client";

import { useEffect, useState, use, useCallback } from "react";
import QRCode from "qrcode";
import { useTranslations } from "@/lib/i18n";
import { czechAccountToIban, buildSpaydString, buildItemizedMessage } from "@/lib/qr-platba";
import { formatCzk } from "@/lib/format";
import { pluralForm } from "@/lib/plural";
import { updatePayer, isRecentBankChange } from "@/lib/payers-client";
import { useConfirm } from "@/components/ConfirmDialog";
import SettlementLinks, { LinkCell, PaymentHistory } from "@/components/bills/SettlementLinks";
import { DEFAULT_MESSAGES, fillMessage, messageCase, type Messages } from "@/lib/settlement-message";

// What exactly a personal part is (Platby summary): the person's receipt lines, or the even split.
type ItemDetail = { lines: { description: string; total: number; share: number; people: number }[]; evenOf: number | null; billTotal: number | null };

type EventBasic = { id: string; name: string; status: "active" | "closed" };

type UnpaidRow = {
  authorId: string;
  name: string;
  // false = the payer was removed from this event's list but is still owed here
  attached: boolean;
  bankAccountNumber: string | null;
  bankCode: string | null;
  lastBankChange: { at: string; byName: string } | null;
  unpaidTotalCzk: string;
  unpaidBillCount: number;
  paidTotalCzk: string;
  paidBillCount: number;
  items: { merchantName: string | null; amountCzk: string | null; paid: boolean }[];
  // Osobní účtenky (2026-10-30), through the event: their own parts (taken off) and the others' parts of personal
  // bills they paid (added); net < 0 = they pay the event.
  personalOutCzk: number;
  personalInCzk: number;
  personalOutItems: { merchantName: string | null; amountCzk: number; paidBy: string | null; detail?: ItemDetail }[];
  personalInItems: { merchantName: string | null; amountCzk: number; debtorName: string; detail?: ItemDetail }[];
  netCzk: number;
  // Vyúčtování (2026-11-01): the person's link and what they marked there.
  link: { path: string; claimedAt: string | null; receivedAt: string | null; acceptedAt: string | null; acceptedAmount: number | null } | null;
};
type Person = { name: string; bankAccountNumber: string | null; bankCode: string | null };
type Debt = { debtorId: string; creditorId: string; amountCzk: number; claimedAt: string | null; debtorName: string; creditorName: string; creditorBankAccountNumber: string | null; creditorBankCode: string | null };

const inputClassSm =
  "rounded-lg border border-mist bg-paper px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";

export default function EventPaymentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t, lang } = useTranslations();
  const confirm = useConfirm();

  const [event, setEvent] = useState<EventBasic | null>(null);
  const [rows, setRows] = useState<UnpaidRow[]>([]);
  // Where people pay the event (its bank account, else the treasurer's).
  const [receiver, setReceiver] = useState<Person | null>(null);
  // Which summary lines are opened ("<authorId>:in|out|official").
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const isOpen = (id: string, k: string) => opened.has(`${id}:${k}`);
  const toggleOpen = (id: string, k: string) => setOpened((o) => { const n = new Set(o); if (n.has(`${id}:${k}`)) n.delete(`${id}:${k}`); else n.add(`${id}:${k}`); return n; });
  const [debts, setDebts] = useState<Debt[]>([]);
  const [debtQr, setDebtQr] = useState<Record<string, string>>({});
  // The texts sent with the links (Platby settings): the right variant per person.
  const [messages, setMessages] = useState<Messages>(DEFAULT_MESSAGES);
  const messageFor = (authorId: string, name: string, url: string) => {
    const row = rows.find((r) => r.authorId === authorId);
    const owesPeople = debts.filter((d) => d.debtorId === authorId).reduce((s, d) => s + d.amountCzk, 0);
    const owedByPeople = debts.filter((d) => d.creditorId === authorId).reduce((s, d) => s + d.amountCzk, 0);
    const c = messageCase({ official: Number(row?.unpaidTotalCzk ?? 0), personalIn: row?.personalInCzk ?? 0, personalOut: row?.personalOutCzk ?? 0, owedByPeople, owesPeople, net: row?.netCzk ?? 0 });
    return fillMessage(messages[c], { name: name.split(" ")[0] || name, event: event?.name ?? "", net: row?.netCzk ?? 0, owesPeople, owedByPeople, link: url });
  };
  const [scope, setScope] = useState<"approved" | "all">("approved");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [ibans, setIbans] = useState<Record<string, string | null>>({});
  const [qrUnavailableReason, setQrUnavailableReason] = useState<
    Record<string, "no_bank" | "bad_bank" | "zero_amount">
  >({});

  const [editingAuthorId, setEditingAuthorId] = useState<string | null>(null);
  const [editBankAccountNumber, setEditBankAccountNumber] = useState("");
  const [editBankCode, setEditBankCode] = useState("");
  const [savingBank, setSavingBank] = useState(false);

  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [evRes, unpaidRes] = await Promise.all([
      fetch(`/api/events/${id}`),
      fetch(`/api/events/${id}/unpaid-summary?scope=${scope}`),
    ]);
    if (evRes.ok) setEvent(await evRes.json());
    if (unpaidRes.ok) {
      const d = await unpaidRes.json();
      setRows(d.rows);
      setReceiver(d.receiver);
      setDebts(d.debts);
    }
    setLoading(false);
  }, [id, scope]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;

    async function generate() {
      const newUrls: Record<string, string> = {};
      const newIbans: Record<string, string | null> = {};
      const newReasons: Record<string, "no_bank" | "bad_bank" | "zero_amount"> = {};

      for (const row of rows) {
        // Net < 0: the person pays the event (QR to the event's account).
        const owes = row.netCzk < 0;
        const account = owes ? receiver : { bankAccountNumber: row.bankAccountNumber, bankCode: row.bankCode };
        if (!account?.bankAccountNumber || !account.bankCode) {
          newIbans[row.authorId] = null;
          newReasons[row.authorId] = "no_bank";
          continue;
        }
        const iban = czechAccountToIban(account.bankAccountNumber, account.bankCode);
        newIbans[row.authorId] = iban;
        if (!iban) {
          newReasons[row.authorId] = "bad_bank";
          continue;
        }

        const amount = Math.abs(row.netCzk);
        if (amount <= 0) {
          newReasons[row.authorId] = "zero_amount";
          continue;
        }

        const itemized = owes
          ? null
          : buildItemizedMessage(
              row.items
                .filter((it) => !it.paid && it.amountCzk !== null)
                .map((it) => ({ label: it.merchantName || "Uctenka", amountCzk: parseFloat(it.amountCzk!) })),
              55
            );
        const message = owes ? `${row.name} osobni utraty ${event?.name ?? ""}`.slice(0, 60) : row.personalOutCzk > 0 || row.personalInCzk > 0 ? `${row.name} ${event?.name ?? ""} po zapocteni`.slice(0, 60) : itemized || `${row.name} ${event?.name ?? ""}`;
        const spayd = buildSpaydString(iban, amount, message);
        try {
          newUrls[row.authorId] = await QRCode.toDataURL(spayd, { margin: 1, width: 180 });
        } catch {
          // Leave this author without a QR code — the UI falls back to the
          // "unavailable" message rather than showing a broken image.
        }
      }

      if (!cancelled) {
        setQrDataUrls(newUrls);
        setIbans(newIbans);
        setQrUnavailableReason(newReasons);
      }
    }

    if (rows.length > 0) generate();
    return () => {
      cancelled = true;
    };
  }, [rows, event?.name, receiver]);

  // Person to person (personal bills not paid by the treasurer): a QR to the creditor's account.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Record<string, string> = {};
      for (const d of debts) {
        const iban = d.creditorBankAccountNumber && d.creditorBankCode ? czechAccountToIban(d.creditorBankAccountNumber, d.creditorBankCode) : null;
        if (!iban) continue;
        try {
          out[`${d.debtorId}|${d.creditorId}`] = await QRCode.toDataURL(buildSpaydString(iban, d.amountCzk, `${d.debtorName} osobni utraty`.slice(0, 60)), { margin: 1, width: 150 });
        } catch {}
      }
      if (!cancelled) setDebtQr(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [debts]);

  async function settleDebt(d: Debt) {
    if (!(await confirm({ message: t("personalBills.settleConfirm", { debtor: d.debtorName, creditor: d.creditorName, amount: formatCzk(d.amountCzk) }) }))) return;
    await fetch(`/api/events/${id}/personal-bills/settle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ debtorId: d.debtorId, creditorId: d.creditorId }) }).catch(() => null);
    load();
  }

  function startEditBank(row: UnpaidRow) {
    setEditingAuthorId(row.authorId);
    setEditBankAccountNumber(row.bankAccountNumber ?? "");
    setEditBankCode(row.bankCode ?? "");
  }

  async function saveBankDetails(authorId: string) {
    setSavingBank(true);
    setError(null);
    const res = await updatePayer(id, authorId, {
      bankAccountNumber: editBankAccountNumber,
      bankCode: editBankCode,
    });
    setSavingBank(false);
    if (!res.ok) {
      setError(t(`payers.error.${res.error}`));
      return;
    }
    setEditingAuthorId(null);
    load();
  }

  async function handleMarkPaid(row: UnpaidRow) {
    if (!(await confirm({ message: t("paymentsPage.markPaidConfirm", { count: String(row.unpaidBillCount), name: row.name }) })))
      return;
    setMarkingPaidId(row.authorId);
    setError(null);
    const res = await fetch(`/api/events/${id}/mark-paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorId: row.authorId, action: "pay", scope }),
    });
    setMarkingPaidId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        data.error === "event_closed_locked"
          ? t("billModal.error.event_closed_locked")
          : t("paymentsPage.markPaidFailed")
      );
      return;
    }
    load();
  }

  if (loading) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  if (!event) return <div className="p-8 text-[14px] text-ink-secondary">{t("eventDetail.notFound")}</div>;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <a href={`/events/${id}`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("billsPage.back")}
      </a>

      <h1 className="mb-4 mt-2 text-[22px] font-semibold text-ink">
        {t("paymentsPage.title")} — {event.name}
      </h1>

      <div className="mb-5 flex gap-2">
        <button
          onClick={() => setScope("approved")}
          className={
            "rounded-full border px-3 py-1.5 text-[13px] " +
            (scope === "approved" ? "border-ember bg-ember text-white" : "border-mist bg-paper-2 text-ink-secondary hover:bg-paper")
          }
        >
          {t("paymentsPage.scopeApproved")}
        </button>
        <button
          onClick={() => setScope("all")}
          className={
            "rounded-full border px-3 py-1.5 text-[13px] " +
            (scope === "all" ? "border-ember bg-ember text-white" : "border-mist bg-paper-2 text-ink-secondary hover:bg-paper")
          }
        >
          {t("paymentsPage.scopeAll")}
        </button>
      </div>

      <SettlementLinks eventId={id} people={[...new Set([...rows.map((r) => r.authorId), ...debts.flatMap((d) => [d.debtorId, d.creditorId])])]} names={Object.fromEntries([...rows.map((r) => [r.authorId, r.name]), ...debts.flatMap((d) => [[d.debtorId, d.debtorName], [d.creditorId, d.creditorName]])])} t={t} onChanged={load} onMessages={setMessages} messageFor={messageFor} />

      {error && <p className="mb-4 text-[14px] text-red-600">{error}</p>}

      {rows.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t(scope === "all" ? "paymentsPage.emptyAll" : "paymentsPage.empty")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((row) => (
            <div key={row.authorId} className="flex flex-col gap-4 rounded-lg border border-mist bg-paper-2 p-4 sm:flex-row">
              <div className="flex-1">
                <div className="text-[16px] font-semibold text-ink">{row.name}</div>
                {!row.attached && (
                  <div className="mb-1 text-[12px] text-amber-700">{t("paymentsPage.removedFromEvent")}</div>
                )}
                {/* A short summary; each line opens its items (what exactly, per bill / person). */}
                <div className="mb-2 flex flex-col text-[14px]">
                  {row.personalInCzk > 0 && (
                    <SummaryLine label={t("personalBills.paidForOthers")} value={`+ ${formatCzk(row.personalInCzk)}`} open={isOpen(row.authorId, "in")} onToggle={() => toggleOpen(row.authorId, "in")}>
                      {row.personalInItems.map((it, i) => (
                        <li key={i}>
                          <div className="flex justify-between gap-3">
                            <span className="min-w-0 [overflow-wrap:anywhere]">
                              {it.debtorName}: {it.merchantName || "—"}
                            </span>
                            <span className="shrink-0 whitespace-nowrap tabular-nums">{formatCzk(it.amountCzk)}</span>
                          </div>
                          <ItemLines detail={it.detail} />
                        </li>
                      ))}
                    </SummaryLine>
                  )}
                  {row.personalOutCzk > 0 && (
                    <SummaryLine label={t("personalBills.ownSpending")} value={`− ${formatCzk(row.personalOutCzk)}`} open={isOpen(row.authorId, "out")} onToggle={() => toggleOpen(row.authorId, "out")}>
                      {row.personalOutItems.map((it, i) => (
                        <li key={i}>
                          <div className="flex justify-between gap-3">
                            <span className="min-w-0 [overflow-wrap:anywhere]">
                              {it.merchantName || "—"}
                              {it.paidBy && <span className="text-ink-secondary/80"> · {t("personalBills.paidBy", { name: it.paidBy })}</span>}
                            </span>
                            <span className="shrink-0 whitespace-nowrap tabular-nums">{formatCzk(it.amountCzk)}</span>
                          </div>
                          <ItemLines detail={it.detail} />
                        </li>
                      ))}
                    </SummaryLine>
                  )}
                  {(row.unpaidBillCount > 0 || row.paidBillCount > 0) && (
                    <SummaryLine
                      label={`${t("paymentsPage.officialBills")} (${row.unpaidBillCount} ${t(`paymentsPage.bills.${pluralForm(row.unpaidBillCount, lang)}`)})`}
                      value={formatCzk(row.unpaidTotalCzk)}
                      open={isOpen(row.authorId, "official")}
                      onToggle={() => toggleOpen(row.authorId, "official")}
                    >
                      {row.items.map((it, i) => (
                        <li key={i} className={"flex justify-between gap-3 " + (it.paid ? "text-ink-secondary/70 line-through" : "")}>
                          <span className="min-w-0 [overflow-wrap:anywhere]">
                            {it.merchantName || "—"}
                            {it.paid && ` (${t("paymentsPage.itemPaidOut")})`}
                          </span>
                          <span className="shrink-0 whitespace-nowrap tabular-nums">{it.amountCzk !== null ? formatCzk(it.amountCzk) : "—"}</span>
                        </li>
                      ))}
                    </SummaryLine>
                  )}
                  {row.paidBillCount > 0 && <span className="text-[12px] text-ink-secondary">{t("paymentsPage.alreadyPaidOut", { amount: formatCzk(row.paidTotalCzk), count: String(row.paidBillCount) })}</span>}
                  <div className="mt-1 flex justify-between gap-3 border-t border-mist pt-1 font-semibold text-ink">
                    <span>{row.netCzk > 0 ? t("paymentsPage.netPayOut") : row.netCzk < 0 ? t("paymentsPage.netTheyPay") : t("personalBills.netEven")}</span>
                    {Math.abs(row.netCzk) > 0.004 && <span className="shrink-0 whitespace-nowrap tabular-nums">{formatCzk(Math.abs(row.netCzk))}</span>}
                  </div>
                </div>

                {editingAuthorId === row.authorId ? (
                  <div className="mb-2 flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={editBankAccountNumber}
                      onChange={(e) => setEditBankAccountNumber(e.target.value)}
                      placeholder={t("authors.bankAccountPlaceholder")}
                      className={inputClassSm}
                    />
                    <input
                      type="text"
                      value={editBankCode}
                      onChange={(e) => setEditBankCode(e.target.value)}
                      placeholder={t("authors.bankCodePlaceholder")}
                      className={inputClassSm + " w-20"}
                    />
                    <button onClick={() => saveBankDetails(row.authorId)} disabled={savingBank} className="text-[13px] text-pine hover:underline">
                      {t("common.save")}
                    </button>
                    <button onClick={() => setEditingAuthorId(null)} className="text-[13px] text-ink-secondary hover:underline">
                      {t("common.cancel")}
                    </button>
                  </div>
                ) : (
                  <div className="mb-2">
                    {row.bankAccountNumber ? (
                      <span className="text-[13px] text-ink">
                        {row.bankAccountNumber}/{row.bankCode}
                      </span>
                    ) : (
                      <a href={`/events/${id}/payers`} className="text-[13px] text-red-600 hover:underline">
                        {t("paymentsPage.noBankDetails")}
                      </a>
                    )}{" "}
                    {row.attached && (
                      <button onClick={() => startEditBank(row)} className="text-[13px] text-ember hover:underline">
                        {t("paymentsPage.editBankButton")}
                      </button>
                    )}
                    {isRecentBankChange(row.lastBankChange && { ...row.lastBankChange, source: "" }) && row.lastBankChange && (
                      <div className="text-[12px] text-amber-700">
                        {t("payers.bankChanged", {
                          date: new Date(row.lastBankChange.at).toLocaleDateString("cs-CZ"),
                          name: row.lastBankChange.byName,
                        })}
                      </div>
                    )}
                  </div>
                )}



                {(row.unpaidBillCount > 0 || row.personalOutCzk > 0 || row.personalInCzk > 0) && (
                <button
                  onClick={() => handleMarkPaid(row)}
                  disabled={markingPaidId === row.authorId || event.status === "closed"}
                  className="mt-3 rounded-lg bg-ember px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50"
                >
                  {t("paymentsPage.markPaidButton")}
                </button>
                )}
                <LinkCell eventId={id} authorId={row.authorId} link={row.link} net={row.netCzk} message={(url) => messageFor(row.authorId, row.name, url)} t={t} onChanged={load} />
              </div>

              <div className="w-full text-center sm:w-[180px]">
                {row.netCzk < 0 && qrDataUrls[row.authorId] && <div className="mb-1 text-[12px] text-amber-700">{t("personalBills.qrToEvent", { name: receiver?.name ?? "" })}</div>}
                {row.netCzk > 0 && qrDataUrls[row.authorId] && <div className="mb-1 text-[12px] text-amber-700">{t("personalBills.qrPayout", { name: row.name })}</div>}
                {qrDataUrls[row.authorId] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrls[row.authorId]} alt="QR Platba" width={180} height={180} className="mx-auto" />
                ) : (
                  <div className="text-[13px] text-ink-secondary">
                    {t(
                      qrUnavailableReason[row.authorId] === "zero_amount"
                        ? "paymentsPage.qrUnavailableZeroAmount"
                        : qrUnavailableReason[row.authorId] === "no_bank"
                          ? "paymentsPage.noBankDetails"
                          : "paymentsPage.qrUnavailable"
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <PaymentHistory eventId={id} t={t} />

      {debts.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 text-[16px] font-semibold text-ink">{t("personalBills.debtsTitle")}</h2>
          <p className="mb-3 text-[13px] text-ink-secondary">{t("personalBills.debtsHint")}</p>
          <div className="flex flex-col gap-3">
            {debts.map((d) => (
              <div key={`${d.debtorId}|${d.creditorId}`} className="flex flex-col gap-3 rounded-lg border border-mist bg-paper-2 p-3 sm:flex-row sm:items-center">
                <div className="flex-1 text-[14px] text-ink">
                  {t("personalBills.debtLine", { debtor: d.debtorName, creditor: d.creditorName, amount: formatCzk(d.amountCzk) })}
                  {d.claimedAt && <div className="text-[12px] text-amber-700">{t("settlementLinks.claimedPair", { date: new Date(d.claimedAt).toLocaleDateString("cs-CZ") })}</div>}
                  {!d.creditorBankAccountNumber && <div className="text-[12px] text-red-600">{t("paymentsPage.noBankDetails")}</div>}
                  <div>
                    <button type="button" onClick={() => settleDebt(d)} disabled={event.status === "closed"} className="mt-2 rounded-lg bg-ember px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50">
                      {t("personalBills.settle")}
                    </button>
                  </div>
                </div>
                {debtQr[`${d.debtorId}|${d.creditorId}`] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={debtQr[`${d.debtorId}|${d.creditorId}`]} alt="QR Platba" width={150} height={150} className="mx-auto" />
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** One summary line on a person's card: label + amount; a click shows its items. */
/** The receipt lines of one personal part (indented, smaller), or "rovným dílem z X (n lidí)". */
function ItemLines({ detail }: { detail?: ItemDetail }) {
  const { t } = useTranslations();
  if (!detail) return null;
  if (!detail.lines.length)
    return detail.evenOf && detail.billTotal != null ? <div className="pl-3 text-[12px] text-ink-secondary/80">{t("settlementPage.evenPart", { n: String(detail.evenOf), total: formatCzk(detail.billTotal) })}</div> : null;
  return (
    <ul className="pl-3 text-[12px] text-ink-secondary/80">
      {detail.lines.map((l, k) => (
        <li key={k} className="flex justify-between gap-3">
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {l.description || "—"}
            {l.people > 1 && ` (${formatCzk(l.total)} / ${l.people})`}
          </span>
          <span className="shrink-0 whitespace-nowrap tabular-nums">{formatCzk(l.share)}</span>
        </li>
      ))}
    </ul>
  );
}

function SummaryLine({ label, value, open, onToggle, children }: { label: string; value: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full justify-between gap-3 py-0.5 text-left text-ink hover:text-ember">
        <span>
          <span className="mr-1 inline-block w-3 text-[11px] text-ink-secondary">{open ? "▾" : "▸"}</span>
          {label}
        </span>
        <span className="shrink-0 whitespace-nowrap tabular-nums">{value}</span>
      </button>
      {open && <ul className="mb-1 ml-4 flex flex-col gap-0.5 text-[12.5px] text-ink-secondary">{children}</ul>}
    </div>
  );
}
