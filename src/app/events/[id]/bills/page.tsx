"use client";

import { useEffect, useState, use, useMemo, useRef } from "react";
import { useTranslations } from "@/lib/i18n";

type EventDetail = { id: string; name: string };

type BillItem = {
  id: string;
  originalFilename: string;
  ingestChannel: "drive" | "upload" | "camera";
  status: string;
  merchantName: string | null;
  totalAmount: string | null;
  amountCzk: string | null;
  currency: string;
  billDate: string | null;
  createdAt: string;
  payerAuthor: { canonicalName: string } | null;
  categories: { eventCategory: { name: string } }[];
};

type BulkFailure = {
  billId: string;
  filename: string;
  error: string;
  missing?: string[];
  splitTotal?: string;
  billTotal?: string;
};

const STATUSES = [
  "new",
  "queued",
  "processing",
  "auto_approved",
  "to_review",
  "failed",
  "approved",
] as const;

function statusStyle(status: string): string {
  switch (status) {
    case "approved":
      return "bg-pine-bg text-pine";
    case "failed":
      return "bg-red-50 text-red-600";
    case "queued":
    case "processing":
      return "bg-amber-50 text-amber-700";
    case "to_review":
      return "bg-ember/10 text-ember";
    default:
      return "bg-mist text-ink-secondary";
  }
}

const pillBase = "rounded-full px-3 py-1.5 text-[13px] border transition-colors";
const pillActive = "bg-ember text-white border-ember";
const pillInactive = "bg-paper-2 text-ink-secondary border-mist hover:bg-paper";

const btnPrimary =
  "rounded-lg bg-ember px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ember-hover disabled:opacity-50 disabled:cursor-not-allowed";
const btnSecondary =
  "rounded-lg border border-mist bg-paper-2 px-3 py-1.5 text-[13px] text-ink hover:bg-paper disabled:opacity-50 disabled:cursor-not-allowed";
const btnDanger =
  "rounded-lg border border-red-300 bg-paper-2 px-3 py-1.5 text-[13px] text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed";

export default function EventBillsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useTranslations();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [bills, setBills] = useState<BillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkFailures, setBulkFailures] = useState<BulkFailure[]>([]);

  const [aiProgressIds, setAiProgressIds] = useState<Set<string> | null>(null);
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [showMoveSelect, setShowMoveSelect] = useState(false);
  const [moveTargetId, setMoveTargetId] = useState("");

  // Guards against out-of-order fetch responses: only the response matching
  // the most recently issued request is ever applied to state. Without
  // this, a slightly-delayed response can land after a newer one and
  // silently overwrite fresher data with stale data — this is what caused
  // the premature "done" message and contributed to the constant flashing.
  const requestIdRef = useRef(0);

  const statusLabels: Record<string, string> = {
    new: t("billsPage.statusNew"),
    queued: t("billsPage.statusQueued"),
    processing: t("billsPage.statusProcessing"),
    auto_approved: t("billsPage.statusAutoApproved"),
    to_review: t("billsPage.statusToReview"),
    failed: t("billsPage.statusFailed"),
    approved: t("billsPage.statusApproved"),
  };

  async function load() {
    setLoading(true);
    const requestId = ++requestIdRef.current;
    const [evRes, billsRes] = await Promise.all([
      fetch(`/api/events/${id}`),
      fetch(`/api/events/${id}/bills`),
    ]);
    const isStale = requestId !== requestIdRef.current;
    if (evRes.ok && !isStale) setEvent(await evRes.json());
    if (billsRes.ok && !isStale) setBills(await billsRes.json());
    setLoading(false);
  }

  // Used only by background polling — updates bills quietly, never touches
  // the loading state, so it never blanks the page. This is the actual fix
  // for the flashing: polling no longer goes through the full page load.
  async function refreshBillsQuietly() {
    const requestId = ++requestIdRef.current;
    const res = await fetch(`/api/events/${id}/bills`);
    if (!res.ok) return;
    const data = await res.json();
    if (requestId !== requestIdRef.current) return;
    setBills(data);
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    fetch(`/api/events`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setEvents)
      .catch(() => {});
  }, []);

  const aiActiveCount = useMemo(
    () => bills.filter((b) => b.status === "queued" || b.status === "processing").length,
    [bills]
  );
  const hasActiveAiRun = aiActiveCount > 0;

  useEffect(() => {
    if (!hasActiveAiRun) return;
    const interval = setInterval(() => {
      refreshBillsQuietly();
    }, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveAiRun]);

  useEffect(() => {
    if (!aiProgressIds || aiProgressIds.size === 0) return;
    const stillActive = bills.filter(
      (b) => aiProgressIds.has(b.id) && (b.status === "queued" || b.status === "processing")
    );
    if (stillActive.length === 0) {
      const tracked = bills.filter((b) => aiProgressIds.has(b.id));
      const failedCount = tracked.filter((b) => b.status === "failed").length;
      const succeeded = tracked.length - failedCount;
      setBulkMessage(
        t("billsPage.bulkResult", { succeeded: String(succeeded), failed: String(failedCount) })
      );
      setAiProgressIds(null);
    }
  }, [bills, aiProgressIds, t]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of STATUSES) c[s] = 0;
    for (const b of bills) c[b.status] = (c[b.status] || 0) + 1;
    return c;
  }, [bills]);

  const filteredBills = statusFilter ? bills.filter((b) => b.status === statusFilter) : bills;

  const runningTotal = filteredBills.reduce(
    (sum, b) => sum + parseFloat(b.amountCzk || "0"),
    0
  );

  const unconvertedCount = filteredBills.filter(
    (b) => b.totalAmount !== null && b.amountCzk === null
  ).length;

  function billHref(billId: string) {
    return `/events/${id}/bills/${billId}${statusFilter ? `?status=${statusFilter}` : ""}`;
  }

  function isAiLocked(b: BillItem) {
    return b.status === "queued" || b.status === "processing";
  }

  function toggleSelect(billId: string) {
    const next = new Set(selected);
    if (next.has(billId)) {
      next.delete(billId);
    } else {
      next.add(billId);
    }
    setSelected(next);
  }

  const allVisibleSelected =
    filteredBills.length > 0 && filteredBills.every((b) => selected.has(b.id));

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredBills.map((b) => b.id)));
    }
  }

  async function runBulk(action: "approve" | "delete" | "mark_paid" | "mark_unpaid") {
    if (selected.size === 0) return;

    if (action === "delete") {
      const ok = window.confirm(
        t("billsPage.confirmBulkDelete", { count: String(selected.size) })
      );
      if (!ok) return;
    }

    setBulkRunning(true);
    setBulkMessage(null);
    setBulkFailures([]);
    setError(null);

    const res = await fetch(`/api/events/${id}/bills/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, billIds: Array.from(selected) }),
    });

    if (!res.ok) {
      setError(t("billsPage.bulkFailed"));
      setBulkRunning(false);
      return;
    }

    const data = await res.json();
    setBulkMessage(
      t("billsPage.bulkResult", {
        succeeded: String(data.succeededCount),
        failed: String(data.failedCount),
      })
    );
    setBulkFailures(data.failed || []);
    setSelected(new Set());
    setBulkRunning(false);
    load();
  }

  async function runBulkMove() {
    if (selected.size === 0 || !moveTargetId) return;
    const targetEvent = events.find((ev) => ev.id === moveTargetId);
    if (!targetEvent) return;
    if (
      !window.confirm(
        t("billsPage.bulkMoveConfirm", { count: String(selected.size), name: targetEvent.name })
      )
    )
      return;

    setBulkRunning(true);
    setBulkMessage(null);
    setBulkFailures([]);
    setError(null);

    const res = await fetch(`/api/events/${id}/bills/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move", billIds: Array.from(selected), targetEventId: moveTargetId }),
    });

    if (!res.ok) {
      setError(t("billsPage.bulkFailed"));
      setBulkRunning(false);
      return;
    }

    const data = await res.json();
    setBulkMessage(
      t("billsPage.bulkResult", {
        succeeded: String(data.succeededCount),
        failed: String(data.failedCount),
      })
    );
    setBulkFailures(data.failed || []);
    setSelected(new Set());
    setShowMoveSelect(false);
    setMoveTargetId("");
    setBulkRunning(false);
    load();
  }

  async function runBulkAi() {
    if (selected.size === 0) return;
    if (selected.size > 20) {
      setError(t("billsPage.bulkAiTooMany", { max: "20" }));
      return;
    }
    const ok = window.confirm(t("billsPage.confirmBulkAi", { count: String(selected.size) }));
    if (!ok) return;

    setBulkMessage(null);
    setBulkFailures([]);
    setError(null);

    const billIdsToTrack = Array.from(selected);

    const res = await fetch(`/api/events/${id}/bills/bulk-ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billIds: billIdsToTrack }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        data.error === "too_many_bills"
          ? t("billsPage.bulkAiTooMany", { max: String(data.max) })
          : t("billsPage.bulkAiFailed")
      );
      return;
    }

    setSelected(new Set());
    // Load fresh data BEFORE starting to track — otherwise the completion
    // check can run once against stale bills from before this run even
    // started, see nothing "active" simply because it hadn't refreshed
    // yet, and declare the run falsely complete immediately.
    await load();
    setAiProgressIds(new Set(billIdsToTrack));
  }

  function bulkFailureText(f: BulkFailure): string {
    if (f.error === "missing_fields") {
      return t("billsPage.bulkErrMissing", {
        filename: f.filename,
        fields: (f.missing || []).join(", "),
      });
    }
    if (f.error === "split_mismatch") {
      return t("billsPage.bulkErrSplit", {
        filename: f.filename,
        splitTotal: f.splitTotal || "?",
        billTotal: f.billTotal || "?",
      });
    }
    if (f.error === "already_approved") {
      return t("billsPage.bulkErrApproved", { filename: f.filename });
    }
    if (f.error === "no_payer") {
      return t("billsPage.bulkErrNoPayer", { filename: f.filename });
    }
    if (f.error === "bill_approved_locked") {
      return t("billsPage.bulkErrApprovedLocked", { filename: f.filename });
    }
    if (f.error === "event_closed_locked") {
      return t("billsPage.bulkErrEventClosed", { filename: f.filename });
    }
    return `${f.filename}: ${f.error}`;
  }

  if (loading) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  if (!event) return <div className="p-8 text-[14px] text-ink-secondary">{t("eventDetail.notFound")}</div>;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <h1 className="mb-5 text-[22px] font-semibold text-ink">
        {event.name} — {t("billsPage.title")}
      </h1>

      {error && <p className="mb-4 text-[14px] text-red-600">{error}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter(null)}
          className={`${pillBase} ${statusFilter === null ? pillActive : pillInactive}`}
        >
          {t("billsPage.filterAll")} ({bills.length})
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            className={`${pillBase} ${statusFilter === s ? pillActive : pillInactive}`}
          >
            {statusLabels[s]} ({counts[s]})
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-mist bg-paper-2 p-3">
          <span className="text-[14px] font-medium text-ink">
            {t("billsPage.selectedCount", { count: String(selected.size) })}
          </span>
          <button onClick={() => runBulk("approve")} disabled={bulkRunning} className={btnPrimary}>
            {t("billsPage.bulkApprove")}
          </button>
          <button onClick={runBulkAi} disabled={hasActiveAiRun} className={btnPrimary}>
            {hasActiveAiRun ? t("billModal.aiProcessing") : t("billModal.aiReprocess")}
          </button>
          <button onClick={() => runBulk("mark_paid")} disabled={bulkRunning} className={btnSecondary}>
            {t("billsPage.bulkMarkPaid")}
          </button>
          <button onClick={() => runBulk("mark_unpaid")} disabled={bulkRunning} className={btnSecondary}>
            {t("billsPage.bulkMarkUnpaid")}
          </button>
          <button onClick={() => setShowMoveSelect((v) => !v)} disabled={bulkRunning} className={btnSecondary}>
            {t("billsPage.bulkMoveButton")}
          </button>
          <button onClick={() => runBulk("delete")} disabled={bulkRunning} className={btnDanger}>
            {t("billsPage.bulkDelete")}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-[13px] text-ink-secondary underline hover:text-ink"
          >
            {t("billsPage.clearSelection")}
          </button>
          {bulkRunning && <span className="text-[13px] text-ink-secondary">{t("common.loading")}</span>}
        </div>
      )}

      {showMoveSelect && selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-mist bg-paper-2 p-3">
          <select
            value={moveTargetId}
            onChange={(e) => setMoveTargetId(e.target.value)}
            className="rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink"
          >
            <option value="">{t("billsPage.bulkMoveSelectPlaceholder")}</option>
            {events
              .filter((ev) => ev.id !== id)
              .map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
          </select>
          <button onClick={runBulkMove} disabled={!moveTargetId || bulkRunning} className={btnPrimary}>
            {t("billsPage.bulkMoveConfirmButton")}
          </button>
        </div>
      )}

      {hasActiveAiRun && (
        <p className="mb-2 text-[13px] text-ink-secondary">
          {t("billsPage.bulkAiActive", { count: String(aiActiveCount) })}
        </p>
      )}

      {bulkMessage && <p className="mb-2 text-[13px] text-pine">{bulkMessage}</p>}

      {bulkFailures.length > 0 && (
        <div className="mb-4 text-[13px] text-amber-700">
          <div className="font-medium">{t("billsPage.bulkFailuresTitle")}</div>
          <ul className="mt-1 list-disc pl-5">
            {bulkFailures.map((f) => (
              <li key={f.billId}>{bulkFailureText(f)}</li>
            ))}
          </ul>
        </div>
      )}

      {filteredBills.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("eventDetail.billsEmpty")}</p>
      ) : (
        <>
          {/* Desktop / tablet: table */}
          <table className="hidden w-full border-collapse md:table">
            <thead>
              <tr className="border-b border-mist text-left">
                <th className="w-8 p-2">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} />
                </th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("eventDetail.colFilename")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("common.status")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("billsPage.colMerchant")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("billModal.payer")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("eventDetail.colCategory")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("billsPage.colAmount")}</th>
                <th className="p-2 text-[12px] font-medium text-ink-secondary">{t("billModal.date")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredBills.map((b) => (
                <tr key={b.id} className="border-b border-mist/60">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selected.has(b.id)}
                      onChange={() => toggleSelect(b.id)}
                      disabled={isAiLocked(b)}
                    />
                  </td>
                  <td className="p-2 text-[14px]">
                    {isAiLocked(b) ? (
                      <span className="text-ink-secondary">{b.originalFilename}</span>
                    ) : (
                      <a href={billHref(b.id)} className="text-ember hover:underline">
                        {b.originalFilename}
                      </a>
                    )}
                  </td>
                  <td className="p-2">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] ${statusStyle(b.status)}`}>
                      {statusLabels[b.status] || b.status}
                    </span>
                  </td>
                  <td className="p-2 text-[14px] text-ink">{b.merchantName || "—"}</td>
                  <td className="p-2 text-[14px] text-ink">{b.payerAuthor?.canonicalName ?? "Akce"}</td>
                  <td className="p-2 text-[13px] text-ink-secondary">
                    {b.categories.length > 0 ? b.categories.map((c) => c.eventCategory.name).join(", ") : "—"}
                  </td>
                  <td className="p-2 text-[14px] text-ink">
                    {b.totalAmount === null ? (
                      "—"
                    ) : (
                      <>
                        {parseFloat(b.totalAmount).toLocaleString("cs-CZ")} {b.currency}
                        {b.currency !== "CZK" && (
                          <div className={`text-[12px] ${b.amountCzk ? "text-ink-secondary" : "text-amber-700"}`}>
                            {b.amountCzk
                              ? `= ${parseFloat(b.amountCzk).toLocaleString("cs-CZ")} Kč`
                              : t("billsPage.noRate")}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="p-2 text-[14px] text-ink-secondary">
                    {b.billDate ? new Date(b.billDate).toLocaleDateString("cs-CZ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} className="p-2 text-[14px] font-medium text-ink">
                  {t("billsPage.colTotal")}
                </td>
                <td className="p-2 text-[14px] font-medium text-ink">
                  {runningTotal.toLocaleString("cs-CZ")} Kč
                  {unconvertedCount > 0 && (
                    <div className="text-[12px] font-normal text-amber-700">
                      {t("billsPage.totalExcludes", { count: String(unconvertedCount) })}
                    </div>
                  )}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          {/* Mobile: cards */}
          <div className="flex flex-col gap-2 md:hidden">
            <label className="flex items-center gap-2 px-1 text-[13px] text-ink-secondary">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} />
              {t("billsPage.selectedCount", { count: String(selected.size) })}
            </label>

            {filteredBills.map((b) => (
              <div key={b.id} className="rounded-lg border border-mist bg-paper-2 p-3">
                <div className="mb-1.5 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(b.id)}
                      onChange={() => toggleSelect(b.id)}
                      disabled={isAiLocked(b)}
                      className="mt-1 shrink-0"
                    />
                    <div className="min-w-0">
                      {isAiLocked(b) ? (
                        <span className="block truncate text-[14px] text-ink-secondary">{b.originalFilename}</span>
                      ) : (
                        <a href={billHref(b.id)} className="block truncate text-[14px] text-ember hover:underline">
                          {b.originalFilename}
                        </a>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] ${statusStyle(b.status)}`}>
                    {statusLabels[b.status] || b.status}
                  </span>
                </div>

                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[14px] font-medium text-ink">{b.merchantName || "—"}</span>
                  <span className="shrink-0 text-[14px] font-medium text-ink">
                    {b.totalAmount === null
                      ? "—"
                      : `${parseFloat(b.totalAmount).toLocaleString("cs-CZ")} ${b.currency}`}
                  </span>
                </div>
                {b.totalAmount !== null && b.currency !== "CZK" && (
                  <div className={`text-right text-[12px] ${b.amountCzk ? "text-ink-secondary" : "text-amber-700"}`}>
                    {b.amountCzk ? `= ${parseFloat(b.amountCzk).toLocaleString("cs-CZ")} Kč` : t("billsPage.noRate")}
                  </div>
                )}

                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-secondary">
                  <span>{b.payerAuthor?.canonicalName ?? "Akce"}</span>
                  {b.categories.length > 0 && <span>{b.categories.map((c) => c.eventCategory.name).join(", ")}</span>}
                  <span>{b.billDate ? new Date(b.billDate).toLocaleDateString("cs-CZ") : "—"}</span>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between rounded-lg border border-mist bg-paper-2 p-3">
              <span className="text-[14px] font-medium text-ink">{t("billsPage.colTotal")}</span>
              <div className="text-right">
                <span className="text-[14px] font-medium text-ink">{runningTotal.toLocaleString("cs-CZ")} Kč</span>
                {unconvertedCount > 0 && (
                  <div className="text-[12px] text-amber-700">
                    {t("billsPage.totalExcludes", { count: String(unconvertedCount) })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
