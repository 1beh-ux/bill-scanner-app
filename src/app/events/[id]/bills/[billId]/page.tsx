"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "@/lib/i18n";
import ImageEditor from "@/components/ImageEditor";
import { useAlert, useConfirm } from "@/components/ConfirmDialog";
import PayerCombobox from "@/components/payers/PayerCombobox";
import { formSnapshot, type SplitRow } from "@/lib/bill-form";
import type { Payer } from "@/lib/payers-client";

type EventCategory = { id: string; name: string };

type BillCategoryRow = {
  id: string;
  eventCategoryId: string;
  amount: string;
  eventCategory: { id: string; name: string };
};

type BillDetail = {
  id: string;
  originalFilename: string;
  displayFilename: string | null;
  status: string;
  merchantName: string | null;
  billDate: string | null;
  totalAmount: string | null;
  currency: string;
  payerAuthorId: string | null;
  payerAuthor?: { id: string; canonicalName: string } | null;
  notes: string | null;
  originalGcsObjectPath: string | null;
  contentHash: string;
  amountCzk: string | null;
  exchangeRateUsed: string | null;
  exchangeRateDate: string | null;
  aiConfidence: string | null;
  aiRawResponse: unknown;
  paidToAuthor: boolean;
  categories: BillCategoryRow[];
};


type BillListEntry = { id: string; status: string };

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json();
  } catch {
    return { error: `HTTP ${res.status}` };
  }
}

function getAiFailureReason(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.error === "string") return r.error;
  const data = r.data as Record<string, unknown> | undefined;
  if (data && typeof data.notes === "string" && data.notes) return data.notes;
  return null;
}

const inputBase =
  "rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember disabled:bg-paper disabled:text-ink-secondary";
const inputClass = inputBase + " w-full";
const labelClass = "mb-1 block text-[12px] text-ink-secondary";

export default function BillDetailPage({
  params,
}: {
  params: Promise<{ id: string; billId: string }>;
}) {
  const { id: eventId, billId } = use(params);
  const router = useRouter();
  const { t } = useTranslations();
  const confirm = useConfirm();
  const alert = useAlert();

  const [bill, setBill] = useState<BillDetail | null>(null);
  const [eventCategories, setEventCategories] = useState<EventCategory[]>([]);
  const [payers, setPayers] = useState<Payer[]>([]);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [adjacent, setAdjacent] = useState<{ prev: string | null; next: string | null }>({
    prev: null,
    next: null,
  });
  const [events, setEvents] = useState<{ id: string; name: string; status: string }[]>([]);
  // Move targets: active events other than this one where this user has bills access.
  const moveTargets = events.filter((ev) => ev.id !== eventId && ev.status === "active");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [merchantName, setMerchantName] = useState("");
  const [billDate, setBillDate] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [currency, setCurrency] = useState("CZK");
  const [payerAuthorId, setPayerAuthorId] = useState("");
  const [notes, setNotes] = useState("");
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [editingImage, setEditingImage] = useState(false);
const [processingAi, setProcessingAi] = useState(false);
  const [paidToggling, setPaidToggling] = useState(false);
  // Form values as last loaded from the server (or saved); null until the first load.
  const [baseline, setBaseline] = useState<string | null>(null);
  // Live CZK preview for foreign-currency bills: the rate for the bill's date, from the same
  // conversion the save uses (/api/exchange-rates/lookup). `key` ties a result to the inputs it
  // was fetched for, so "loading" is derived instead of set inside the effect.
  const [fx, setFx] = useState<{ key: string; rate: string | null; rateDate: string | null } | null>(null);
  const fxKey = currency !== "CZK" && billDate ? `${currency}|${billDate}` : null;
  const isPdf = bill?.originalFilename.toLowerCase().endsWith(".pdf") ?? false;

  async function handlePaidChange(paid: boolean) {
    if (!(await confirm({ message: t(paid ? "billModal.markPaidConfirm" : "billModal.markUnpaidConfirm") }))) return;
    setPaidToggling(true);
    setError(null);
    const res = await fetch(`/api/bills/${billId}/paid`, { method: paid ? "POST" : "DELETE" });
    setPaidToggling(false);
    if (!res.ok) {
      const data = await safeJson(res);
      setError(t(`billModal.error.${data.error}`) || t("billModal.paidChangeFailed"));
      return;
    }
    load();
  }

  useEffect(() => {
    if (!fxKey) return;
    let cancelled = false;
    const [cur, date] = fxKey.split("|");
    fetch(`/api/exchange-rates/lookup?currency=${cur}&date=${date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && setFx({ key: fxKey, rate: d?.rateToCzk ?? null, rateDate: d?.rateDate ?? null }))
      .catch(() => !cancelled && setFx({ key: fxKey, rate: null, rateDate: null }));
    return () => {
      cancelled = true;
    };
  }, [fxKey]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setStatusFilter(sp.get("status"));
  }, []);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/bills/${billId}`);
    if (res.ok) {
      const data: BillDetail = await res.json();
      setBill(data);
      setMerchantName(data.merchantName || "");
      setBillDate(data.billDate ? data.billDate.slice(0, 10) : "");
      setTotalAmount(data.totalAmount || "");
      setCurrency(data.currency);
      setPayerAuthorId(data.payerAuthorId || "");
      setNotes(data.notes || "");
      const loadedSplits = data.categories.map((c) => ({
        eventCategoryId: c.eventCategoryId,
        amount: String(c.amount),
      }));
      setSplits(loadedSplits);
      setBaseline(
        formSnapshot({
          merchant: data.merchantName || "",
          date: data.billDate ? data.billDate.slice(0, 10) : "",
          total: data.totalAmount || "",
          currency: data.currency,
          payer: data.payerAuthorId || "",
          notes: data.notes || "",
          splits: loadedSplits,
        })
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [billId]);

  useEffect(() => {
    fetch(`/api/events/${eventId}/categories`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setEventCategories)
      .catch(() => {});
    fetch(`/api/events/${eventId}/payers`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setPayers)
      .catch(() => {});
    fetch(`/api/events?module=bills`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setEvents)
      .catch(() => {});
  }, [eventId]);

  useEffect(() => {
    fetch(`/api/events/${eventId}/bills`)
      .then((r) => (r.ok ? r.json() : []))
      .then((all: BillListEntry[]) => {
        const filtered = statusFilter ? all.filter((b) => b.status === statusFilter) : all;
        const idx = filtered.findIndex((b) => b.id === billId);
        setAdjacent({
          prev: idx > 0 ? filtered[idx - 1].id : null,
          next: idx >= 0 && idx < filtered.length - 1 ? filtered[idx + 1].id : null,
        });
      })
      .catch(() => {});
  }, [eventId, billId, statusFilter]);

  // While this bill is being processed by AI (queued or actively in
  // flight), poll for it to resolve so the page updates itself once done —
  // matches the same live-progress pattern used on the bills list.
  useEffect(() => {
    const aiLocked = bill?.status === "queued" || bill?.status === "processing";
    if (!aiLocked) return;

    const interval = setInterval(() => {
      load();
    }, 4000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill?.status]);

  const isApproved = bill?.status === "approved";
  const isAiLocked = bill?.status === "queued" || bill?.status === "processing";
  const isLocked = isApproved || isAiLocked;

  function qs() {
    return statusFilter ? `?status=${statusFilter}` : "";
  }
  const backHref = `/events/${eventId}/bills${qs()}`;

  const isDirty =
    baseline !== null &&
    !isLocked &&
    formSnapshot({ merchant: merchantName, date: billDate, total: totalAmount, currency, payer: payerAuthorId, notes, splits }) !== baseline;

  // Leaving the page (back link, previous/next bill, arrow keys) asks first when the form has
  // unsaved changes -- with the styled dialog, not a native pop-up.
  async function leave(go: () => void) {
    if (isDirty) {
      const ok = await confirm({
        message: t("billModal.unsavedConfirm"),
        confirmLabel: t("billModal.leaveWithoutSaving"),
        danger: true,
      });
      if (!ok) return;
    }
    go();
  }

  function navigate(id: string) {
    leave(() => router.push(`/events/${eventId}/bills/${id}${qs()}`));
  }

  // Reload / closing the tab can only get the browser's own prompt.
  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Escape closes the topmost overlay (the image editor here; dialogs handle their
      // own Escape) and NEVER leaves the page -- leaving is the visible "Zpět" link.
      if (e.key === "Escape") {
        if (editingImage) setEditingImage(false);
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft" && adjacent.prev) navigate(adjacent.prev);
      if (e.key === "ArrowRight" && adjacent.next) navigate(adjacent.next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjacent, backHref, editingImage, isDirty]);


  const splitTotal = splits.reduce((sum, s) => sum + parseFloat(s.amount || "0"), 0);
  const billTotalNum = parseFloat(totalAmount || "0");
  const difference = billTotalNum - splitTotal;
  const splitsMatch = splits.length > 0 && Math.abs(difference) < 0.005;

  function addSplit() {
    const used = new Set(splits.map((s) => s.eventCategoryId));
    const next = eventCategories.find((c) => !used.has(c.id));
    if (!next) return;
    setSplits([...splits, { eventCategoryId: next.id, amount: "" }]);
  }

  function updateSplit(index: number, patch: Partial<SplitRow>) {
    setSplits(splits.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function removeSplit(index: number) {
    setSplits(splits.filter((_, i) => i !== index));
  }

  function fillRemainder(index: number) {
    const others = splits.reduce(
      (sum, s, i) => (i === index ? sum : sum + parseFloat(s.amount || "0")),
      0
    );
    const remainder = billTotalNum - others;
    updateSplit(index, { amount: remainder.toFixed(2) });
  }

  async function handleSave(): Promise<boolean> {
    setSaving(true);
    setError(null);
    setMessage(null);

    const fieldsRes = await fetch(`/api/bills/${billId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchantName,
        billDate: billDate || null,
        totalAmount: totalAmount || null,
        currency,
        payerAuthorId: payerAuthorId || null,
        notes,
      }),
    });

    if (!fieldsRes.ok) {
      const data = await safeJson(fieldsRes);
      setError(t(`billModal.error.${data.error}`));
      setSaving(false);
      return false;
    }

    const validSplits = splits.filter((s) => s.amount !== "" && s.eventCategoryId);
    const splitsRes = await fetch(`/api/bills/${billId}/categories`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ splits: validSplits }),
    });

    if (!splitsRes.ok) {
      const data = await safeJson(splitsRes);
      if (data.error === "split_mismatch") {
        setError(
          t("billModal.error.splitMismatch", {
            splitTotal: String(data.splitTotal),
            billTotal: String(data.billTotal),
          })
        );
      } else {
        setError(t("billModal.error.saveFailed"));
      }
      setSaving(false);
      return false;
    }

    // Saved: the form is the new baseline (otherwise "save and next" would ask about unsaved changes).
    setBaseline(formSnapshot({ merchant: merchantName, date: billDate, total: totalAmount, currency, payer: payerAuthorId, notes, splits }));
    setSaving(false);
    return true;
  }

  async function handleSaveOnly() {
    const ok = await handleSave();
    if (ok) {
      setMessage(t("billModal.saved"));
      load();
    }
  }

  async function handleSaveAndNext() {
    const ok = await handleSave();
    if (!ok) return;
    if (adjacent.next) {
      navigate(adjacent.next);
    } else {
      setMessage(t("billModal.saved"));
      load();
    }
  }

  async function handleApprove() {
    const ok = await handleSave();
    if (!ok) return;

    setSaving(true);
    const res = await fetch(`/api/bills/${billId}/approve`, { method: "POST" });

    if (!res.ok) {
      const data = await safeJson(res);
      if (data.error === "missing_fields") {
        setError(t("billModal.error.missingFields", { fields: (data.missing as string[]).join(", ") }));
      } else if (data.error === "split_mismatch") {
        setError(
          t("billModal.error.splitMismatch", {
            splitTotal: String(data.splitTotal),
            billTotal: String(data.billTotal),
          })
        );
      } else {
        setError(`${t("billModal.error.approveFailed")} (${String(data.error)})`);
      }
      setSaving(false);
      return;
    }

    setSaving(false);
    if (adjacent.next) {
      navigate(adjacent.next);
    } else {
      router.push(backHref);
    }
  }

  async function handleReopen() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/bills/${billId}/approve`, { method: "DELETE" });
    setSaving(false);
    if (res.ok) {
      load();
    } else {
      setError(t("billModal.error.reopenFailed"));
    }
  }
async function handleMoveToEvent(targetEventId: string) {
    const targetEvent = events.find((ev) => ev.id === targetEventId);
    if (!targetEvent) return;
    if (!(await confirm({ message: t("billModal.moveConfirm", { name: targetEvent.name }) }))) return;

    setSaving(true);
    setError(null);
    const res = await fetch(`/api/bills/${billId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetEventId }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await safeJson(res);
      setError(t(`billModal.error.${data.error}`) || t("billModal.moveFailed"));
      return;
    }

    const data = await res.json();
    await alert({
      message: t("billModal.moveDone", {
        matched: String(data.matchedCategories ?? 0),
        dropped: String(data.droppedCategories ?? 0),
      }),
    });
    router.push(`/events/${targetEventId}/bills/${billId}`);
  }
  async function handleProcessAi() {
    setProcessingAi(true);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/bills/${billId}/process-ai`, { method: "POST" });
    setProcessingAi(false);
    if (!res.ok) {
      const data = await safeJson(res);
      setError(t(`billModal.error.${data.error}`) || t("billModal.aiProcessFailed"));
      return;
    }
    setMessage(t("billModal.aiProcessDone"));
    load();
  }

  if (loading || !bill) {
    return <div className="p-6 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  }

const statusLabel = t(
    `billsPage.status${bill.status.replace(/_(.)/g, (_m, x) => x.toUpperCase()).replace(/^./, (x) => x.toUpperCase())}`
  );
  const aiFailureReason = bill.status === "failed" ? getAiFailureReason(bill.aiRawResponse) : null;

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-mist bg-paper-2">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <a
              href={backHref}
              onClick={(e) => {
                if (isDirty) {
                  e.preventDefault();
                  leave(() => router.push(backHref));
                }
              }}
              className="flex shrink-0 items-center gap-1 text-[13px] text-ink-secondary hover:text-ink"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {t("billModal.backToBills")}
            </a>
            <div className="hidden h-4 w-px bg-mist sm:block" />
            <h1 className="truncate text-[15px] font-medium text-ink">{bill.originalFilename}</h1>
            <span
              className={
                "shrink-0 rounded-full px-2.5 py-0.5 text-[12px] " +
                (isApproved ? "bg-pine-bg text-pine" : "bg-mist text-ink-secondary")
              }
            >
              {statusLabel}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => adjacent.prev && navigate(adjacent.prev)}
              disabled={!adjacent.prev}
              title={t("billModal.prev")}
              aria-label={t("billModal.prev")}
              className="rounded-lg border border-mist p-1.5 text-ink-secondary hover:bg-paper disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button
              onClick={() => adjacent.next && navigate(adjacent.next)}
              disabled={!adjacent.next}
              title={t("billModal.next")}
              aria-label={t("billModal.next")}
              className="rounded-lg border border-mist p-1.5 text-ink-secondary hover:bg-paper disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {error && <p className="mx-4 mt-4 text-[13px] text-red-600 md:mx-6">{error}</p>}
      {message && <p className="mx-4 mt-4 text-[13px] text-pine md:mx-6">{message}</p>}
     {isAiLocked && (
        <p className="mx-4 mt-4 text-[13px] text-ink-secondary md:mx-6">
          {t("billModal.aiLockedNotice")}
        </p>
      )}
      {aiFailureReason && (
        <p className="mx-4 mt-4 text-[13px] text-red-600 md:mx-6">
          {t("billModal.aiFailureReason", { reason: aiFailureReason })}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 p-4 md:p-6 lg:grid-cols-2">
        <div>
          {isPdf ? (
            <iframe
              src={`/api/bills/${bill.id}/file?v=${bill.contentHash}`}
              title={bill.originalFilename}
              className="h-[480px] w-full rounded-lg border border-mist"
            />
          ) : (
            <a href={`/api/bills/${bill.id}/file`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/bills/${bill.id}/file?v=${bill.contentHash}`}
                alt={bill.originalFilename}
                className="w-full rounded-lg border border-mist"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </a>
          )}
          <a
            href={`/api/bills/${bill.id}/file`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-[13px] text-ember hover:underline"
          >
            {t("billModal.openFile")}
          </a>
          {!isLocked && (
            <button
              onClick={() => setEditingImage(true)}
              className="mt-1.5 block text-[13px] text-ember hover:underline"
            >
              {t("imageEditor.openButton")}
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className={labelClass}>{t("billModal.merchant")}</label>
            <input
              type="text"
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              disabled={isLocked}
              className={inputClass}
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className={labelClass}>{t("billModal.date")}</label>
              <input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                disabled={isLocked}
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <label className={labelClass}>{t("billModal.amount")}</label>
              <input
                type="number"
                step="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                disabled={isLocked}
                className={inputClass}
              />
            </div>
            <div className="w-24">
              <label className={labelClass}>{t("billModal.currency")}</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={isLocked}
                className={inputClass}
              >
                <option value="CZK">CZK</option>
                <option value="PLN">PLN</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          {currency !== "CZK" && (
            <FxPreview
              t={t}
              hasDate={!!billDate}
              loading={!!fxKey && fx?.key !== fxKey}
              result={fx && fx.key === fxKey ? fx : null}
              amount={parseFloat(totalAmount.replace(",", "."))}
            />
          )}

          <div>
            <label className={labelClass}>{t("billModal.payer")}</label>
            <PayerCombobox
              eventId={eventId}
              payers={payers}
              value={payerAuthorId}
              currentPayer={bill.payerAuthor}
              disabled={isLocked}
              onChange={setPayerAuthorId}
              onPayerCreated={(p) => setPayers((prev) => [...prev, p])}
            />
          </div>

          {bill.payerAuthorId && (
            <div>
              <label className={labelClass}>{t("billModal.paidStatus")}</label>
              <select
                value={bill.paidToAuthor ? "paid" : "unpaid"}
                onChange={(e) => handlePaidChange(e.target.value === "paid")}
                disabled={paidToggling}
                className={inputClass}
              >
                <option value="unpaid">{t("billModal.paidStatusUnpaid")}</option>
                <option value="paid">{t("billModal.paidStatusPaid")}</option>
              </select>
            </div>
          )}

          <div>
            <label className={labelClass}>{t("billModal.notes")}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isLocked}
              rows={2}
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-2 block text-[13px] font-medium text-ink">
              {t("billModal.splitTitle")}
            </label>

            <div className="flex flex-col gap-2">
              {splits.map((s, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <select
                      value={s.eventCategoryId}
                      onChange={(e) => updateSplit(i, { eventCategoryId: e.target.value })}
                      disabled={isLocked}
                      className={inputBase + " min-w-0 flex-1"}
                    >
                      {eventCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      value={s.amount}
                      onChange={(e) => updateSplit(i, { amount: e.target.value })}
                      disabled={isLocked}
                      className={inputBase + " w-28 shrink-0"}
                    />
                    {!isLocked && (
                      <button
                        onClick={() => removeSplit(i)}
                        aria-label={t("billModal.removeSplit")}
                        title={t("billModal.removeSplit")}
                        className="px-1 text-red-600 hover:text-red-700"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {/* Always visible (not a hover tooltip): what is still unassigned and a button to put it here.
                      Hidden only when nothing is left to assign. */}
                  {!isLocked && Number.isFinite(difference) && Math.abs(difference) >= 0.005 && billTotalNum > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-secondary">
                      <span>{t("billModal.splitRemaining", { amount: difference.toFixed(2) })}</span>
                      <button
                        type="button"
                        onClick={() => fillRemainder(i)}
                        className="rounded-md border border-mist bg-paper px-2 py-0.5 text-[12px] text-ember hover:bg-paper-2"
                      >
                        {t("billModal.fillRemainder")}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {!isLocked && (
              <button
                onClick={addSplit}
                className="mt-2 text-[13px] text-ember hover:underline"
              >
                + {t("billModal.addSplit")}
              </button>
            )}

            {splits.length > 0 && (
              <div className={"mt-2 text-[13px] " + (splitsMatch ? "text-pine" : "text-red-600")}>
                {splitsMatch
                  ? t("billModal.splitOk")
                  : t("billModal.splitDiff", {
                      splitTotal: splitTotal.toFixed(2),
                      difference: difference.toFixed(2),
                    })}
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {isApproved ? (
              <button
                onClick={handleReopen}
                disabled={saving}
                className="rounded-lg border border-ink px-4 py-2 text-[13px] text-ink hover:bg-paper"
              >
                {t("billModal.reopen")}
              </button>
            ) : isAiLocked ? null : (
              <>
                <button
                  onClick={handleSaveAndNext}
                  disabled={saving}
                  className="rounded-lg border border-ink px-4 py-2 text-[13px] text-ink hover:bg-paper"
                >
                  {adjacent.next ? t("billModal.saveAndNext") : t("common.save")}
                </button>
                <button
                  onClick={handleSaveOnly}
                  disabled={saving}
                  className="rounded-lg border border-mist px-4 py-2 text-[13px] text-ink-secondary hover:bg-paper"
                >
                  {t("billModal.saveAndStay")}
                </button>
                <button
                  onClick={handleApprove}
                  disabled={saving}
                  className="rounded-lg bg-ember px-4 py-2 text-[13px] font-medium text-white hover:bg-ember-hover"
                >
                  {t("billModal.approve")}
                </button>
              </>
            )}
            <button
              onClick={handleProcessAi}
              disabled={isLocked || processingAi || saving}
              className="rounded-lg border border-mist px-4 py-2 text-[13px] text-ink-secondary hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processingAi ? t("billModal.aiProcessing") : t("billModal.aiReprocess")}
            </button>
            {!isLocked && moveTargets.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) handleMoveToEvent(e.target.value);
                }}
                disabled={saving}
                className={inputBase + " w-auto"}
              >
                <option value="">{t("billModal.moveToEvent")}</option>
                {moveTargets.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            )}
            {saving && <span className="text-[13px] text-ink-secondary">{t("common.loading")}</span>}
          </div>
        </div>
      </div>

      {editingImage && (
        <ImageEditor
          billId={bill.id}
          hasOriginal={!!bill.originalGcsObjectPath}
          version={bill.contentHash}
          isPdf={isPdf}
          onClose={() => setEditingImage(false)}
          onSaved={() => {
            load();
          }}
        />
      )}
    </div>
  );
}

// "≈ 561,20 Kč (kurz 24,165 za den 30. 7. 2026)". The warning appears only when the
// date is missing or the rate really could not be fetched -- and says which of the two.
function FxPreview({
  t,
  hasDate,
  loading,
  result,
  amount,
}: {
  t: (key: string, vars?: Record<string, string>) => string;
  hasDate: boolean;
  loading: boolean;
  result: { rate: string | null; rateDate: string | null } | null;
  amount: number;
}) {
  if (!hasDate) return <div className="text-[13px] text-amber-700">{t("billModal.fxMissingDate")}</div>;
  if (loading || !result) return <div className="text-[13px] text-ink-secondary">{t("billModal.fxLoading")}</div>;
  if (!result.rate || !result.rateDate) return <div className="text-[13px] text-amber-700">{t("billModal.fxRateUnavailable")}</div>;
  const rate = parseFloat(result.rate);
  const date = new Date(result.rateDate).toLocaleDateString("cs-CZ");
  if (!Number.isFinite(amount)) {
    return <div className="text-[13px] text-ink-secondary">{t("billModal.fxRateOnly", { rate: rate.toFixed(3), date })}</div>;
  }
  return (
    <div className="text-[13px] text-pine">
      {t("billModal.fxPreview", {
        amount: (Math.round(amount * rate * 100) / 100).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        rate: rate.toFixed(3),
        date,
      })}
    </div>
  );
}
