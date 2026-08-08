"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "@/lib/i18n";
import ImageEditor from "@/components/ImageEditor";

type EventCategory = { id: string; name: string };
type Author = { id: string; canonicalName: string; active: boolean };

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
  notes: string | null;
  originalGcsObjectPath: string | null;
  contentHash: string;
  amountCzk: string | null;
  exchangeRateUsed: string | null;
  exchangeRateDate: string | null;
  categories: BillCategoryRow[];
};

type SplitRow = { eventCategoryId: string; amount: string };
type BillListEntry = { id: string; status: string };

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json();
  } catch {
    return { error: `HTTP ${res.status}` };
  }
}

const inputClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember disabled:bg-paper disabled:text-ink-secondary";
const labelClass = "mb-1 block text-[12px] text-ink-secondary";

export default function BillDetailPage({
  params,
}: {
  params: Promise<{ id: string; billId: string }>;
}) {
  const { id: eventId, billId } = use(params);
  const router = useRouter();
  const { t } = useTranslations();

  const [bill, setBill] = useState<BillDetail | null>(null);
  const [eventCategories, setEventCategories] = useState<EventCategory[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [adjacent, setAdjacent] = useState<{ prev: string | null; next: string | null }>({
    prev: null,
    next: null,
  });

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
  const isPdf = bill?.originalFilename.toLowerCase().endsWith(".pdf") ?? false;

  // Plain browser API rather than next/navigation's useSearchParams — avoids
  // any Suspense-boundary requirement for something this simple.
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
      setSplits(
        data.categories.map((c) => ({
          eventCategoryId: c.eventCategoryId,
          amount: String(c.amount),
        }))
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
    fetch(`/api/authors`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setAuthors)
      .catch(() => {});
  }, [eventId]);

  // Recomputes prev/next from the full bill list every time, since a fresh
  // page load has no access to whatever filtered list the bills page had in
  // memory — this mirrors the same status-filter logic that page uses.
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

  function qs() {
    return statusFilter ? `?status=${statusFilter}` : "";
  }
  const backHref = `/events/${eventId}/bills${qs()}`;
  function navigate(id: string) {
    router.push(`/events/${eventId}/bills/${id}${qs()}`);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft" && adjacent.prev) navigate(adjacent.prev);
      if (e.key === "ArrowRight" && adjacent.next) navigate(adjacent.next);
      if (e.key === "Escape") router.push(backHref);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjacent, backHref]);

  const isApproved = bill?.status === "approved";

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

  if (loading || !bill) {
    return <div className="p-6 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  }

  const statusLabel = t(
    `billsPage.status${bill.status.replace(/_(.)/g, (_m, x) => x.toUpperCase()).replace(/^./, (x) => x.toUpperCase())}`
  );

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-mist bg-paper-2">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <a
              href={backHref}
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
              className="rounded-lg border border-mist p-1.5 text-ink-secondary hover:bg-paper disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button
              onClick={() => adjacent.next && navigate(adjacent.next)}
              disabled={!adjacent.next}
              title={t("billModal.next")}
              className="rounded-lg border border-mist p-1.5 text-ink-secondary hover:bg-paper disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {error && <p className="mx-4 mt-4 text-[13px] text-red-600 md:mx-6">{error}</p>}
      {message && <p className="mx-4 mt-4 text-[13px] text-pine md:mx-6">{message}</p>}

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
          {!isPdf && !isApproved && (
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
              disabled={isApproved}
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
                disabled={isApproved}
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
                disabled={isApproved}
                className={inputClass}
              />
            </div>
            <div className="w-24">
              <label className={labelClass}>{t("billModal.currency")}</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={isApproved}
                className={inputClass}
              >
                <option value="CZK">CZK</option>
                <option value="PLN">PLN</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          {currency !== "CZK" && (
            <div className={"text-[13px] " + (bill.amountCzk ? "text-pine" : "text-amber-700")}>
              {bill.amountCzk && bill.exchangeRateUsed && bill.exchangeRateDate
                ? t("billModal.czkEquivalent", {
                    amount: parseFloat(bill.amountCzk).toLocaleString("cs-CZ"),
                    rate: parseFloat(bill.exchangeRateUsed).toFixed(3),
                    date: new Date(bill.exchangeRateDate).toLocaleDateString("cs-CZ"),
                  })
                : t("billModal.czkUnavailable")}
            </div>
          )}

          <div>
            <label className={labelClass}>{t("billModal.payer")}</label>
            <select
              value={payerAuthorId}
              onChange={(e) => setPayerAuthorId(e.target.value)}
              disabled={isApproved}
              className={inputClass}
            >
              <option value="">{t("billModal.payerEvent")}</option>
              {authors
                .filter((a) => a.active)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.canonicalName}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>{t("billModal.notes")}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isApproved}
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
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={s.eventCategoryId}
                    onChange={(e) => updateSplit(i, { eventCategoryId: e.target.value })}
                    disabled={isApproved}
                    className={inputClass + " flex-1"}
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
                    disabled={isApproved}
                    className={inputClass + " w-28"}
                  />
                  {!isApproved && (
                    <>
                      <button
                        onClick={() => fillRemainder(i)}
                        title={t("billModal.fillRemainder")}
                        className="text-[13px] text-ember hover:underline"
                      >
                        =
                      </button>
                      <button
                        onClick={() => removeSplit(i)}
                        className="text-red-600 hover:text-red-700"
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>

            {!isApproved && (
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
            ) : (
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
              disabled={isApproved || processingAi || saving}
              className="rounded-lg border border-mist px-4 py-2 text-[13px] text-ink-secondary hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processingAi ? t("billModal.aiProcessing") : t("billModal.aiReprocess")}
            </button>
            {saving && <span className="text-[13px] text-ink-secondary">{t("common.loading")}</span>}
          </div>
        </div>
      </div>

      {editingImage && (
        <ImageEditor
          billId={bill.id}
          hasOriginal={!!bill.originalGcsObjectPath}
          version={bill.contentHash}
          onClose={() => setEditingImage(false)}
          onSaved={() => {
            load();
          }}
        />
      )}
    </div>
  );
}
