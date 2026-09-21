"use client";

import { useEffect, useState, use, useCallback } from "react";
import QRCode from "qrcode";
import { useTranslations } from "@/lib/i18n";
import { czechAccountToIban, buildSpaydString, buildItemizedMessage } from "@/lib/qr-platba";
import { formatCzk } from "@/lib/format";
import { pluralForm } from "@/lib/plural";
import { updatePayer, isRecentBankChange } from "@/lib/payers-client";
import { useConfirm } from "@/components/ConfirmDialog";

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
};

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
    if (unpaidRes.ok) setRows(await unpaidRes.json());
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
        if (!row.bankAccountNumber || !row.bankCode) {
          newIbans[row.authorId] = null;
          newReasons[row.authorId] = "no_bank";
          continue;
        }
        const iban = czechAccountToIban(row.bankAccountNumber, row.bankCode);
        newIbans[row.authorId] = iban;
        if (!iban) {
          newReasons[row.authorId] = "bad_bank";
          continue;
        }

        const amount = parseFloat(row.unpaidTotalCzk || "0");
        if (amount <= 0) {
          newReasons[row.authorId] = "zero_amount";
          continue;
        }

        const itemized = buildItemizedMessage(
          row.items
            .filter((it) => !it.paid && it.amountCzk !== null)
            .map((it) => ({ label: it.merchantName || "Uctenka", amountCzk: parseFloat(it.amountCzk!) })),
          55
        );
        const message = itemized || `${row.name} ${event?.name ?? ""}`;
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
  }, [rows, event?.name]);

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
                <div className="mb-2 text-[14px] text-ink-secondary">
                  {formatCzk(row.unpaidTotalCzk)} · {row.unpaidBillCount}{" "}
                  {t(`paymentsPage.bills.${pluralForm(row.unpaidBillCount, lang)}`)}
                  {row.paidBillCount > 0 && (
                    <span className="ml-2 text-[12px]">
                      ({t("paymentsPage.alreadyPaidOut", { amount: formatCzk(row.paidTotalCzk), count: String(row.paidBillCount) })})
                    </span>
                  )}
                </div>

                <ul className="mb-2 list-disc pl-5 text-[12px] text-ink-secondary">
                  {row.items.map((it, i) => (
                    <li key={i} className={it.paid ? "text-ink-secondary/70 line-through" : ""}>
                      {it.merchantName || "—"}
                      {it.amountCzk !== null && ` — ${formatCzk(it.amountCzk)}`}
                      {it.paid && ` (${t("paymentsPage.itemPaidOut")})`}
                    </li>
                  ))}
                </ul>

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

                {ibans[row.authorId] && (
                  <div className="font-mono text-[12px] text-ink-secondary">
                    {t("paymentsPage.ibanLabel")}: {ibans[row.authorId]}
                  </div>
                )}

                {row.unpaidBillCount > 0 && (
                <button
                  onClick={() => handleMarkPaid(row)}
                  disabled={markingPaidId === row.authorId || event.status === "closed"}
                  className="mt-3 rounded-lg bg-ember px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50"
                >
                  {t("paymentsPage.markPaidButton")}
                </button>
                )}
              </div>

              <div className="w-full text-center sm:w-[180px]">
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
    </div>
  );
}
