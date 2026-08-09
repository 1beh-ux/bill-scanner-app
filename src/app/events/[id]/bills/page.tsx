"use client";

import { useEffect, useState, use, useRef, useMemo } from "react";
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

type DuplicateDetail = { filename: string; existingFilename: string; existingCreatedAt: string };
type SplitDetail = { originalFilename: string; pageCount: number };
type FailureDetail = { filename: string; error: string };

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
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [duplicateDetails, setDuplicateDetails] = useState<DuplicateDetail[]>([]);
  const [splitDetails, setSplitDetails] = useState<SplitDetail[]>([]);
  const [failureDetails, setFailureDetails] = useState<FailureDetail[]>([]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkFailures, setBulkFailures] = useState<BulkFailure[]>([]);

  const [aiProgressIds, setAiProgressIds] = useState<Set<string> | null>(null);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  async function handleUpload(fileList: FileList | null, channel: "upload" | "camera") {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadMessage(null);
    setDuplicateDetails([]);
    setSplitDetails([]);
    setFailureDetails([]);
    setError(null);

    const formData = new FormData();
    for (const file of Array.from(fileList)) {
      formData.append("files", file);
    }
    formData.append("ingestChannel", channel);

    const res = await fetch(`/api/events/${id}/bills`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      setError(t("eventDetail.errorUploadFailed"));
      setUploading(false);
      return;
    }

    const data = await res.json();
    setUploadMessage(
      t("eventDetail.uploadResultSummary", {
        created: String(data.created.length),
        duplicates: String(data.duplicates.length),
      })
    );
    setDuplicateDetails(data.duplicates);
    setSplitDetails(data.splitInfo || []);
    setFailureDetails(data.failures || []);
    setUploading(false);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    load();
  }

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

  async function runBulk(action: "approve" | "delete") {
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
    return `${f.filename}: ${f.error}`;
  }

  if (loading) return <div style={{ padding: "2rem" }}>{t("common.loading")}</div>;
  if (!event) return <div style={{ padding: "2rem" }}>{t("eventDetail.notFound")}</div>;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0 0 1.25rem" }}>
        {event.name} — {t("billsPage.title")}
      </h1>

      {error && <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>}

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <label style={{ padding: "0.5rem 1rem", background: "#111", color: "#fff", borderRadius: 4, cursor: "pointer" }}>
          {t("eventDetail.uploadFiles")}
          <input
            ref={uploadInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={(e) => handleUpload(e.target.files, "upload")}
            style={{ display: "none" }}
          />
        </label>
        <label style={{ padding: "0.5rem 1rem", background: "#fff", color: "#111", border: "1px solid #111", borderRadius: 4, cursor: "pointer" }}>
          {t("eventDetail.takePhoto")}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handleUpload(e.target.files, "camera")}
            style={{ display: "none" }}
          />
        </label>
        {uploading && <span style={{ alignSelf: "center", color: "#666" }}>{t("common.loading")}</span>}
      </div>

      {uploadMessage && <p style={{ color: "#080", marginBottom: "0.5rem" }}>{uploadMessage}</p>}

      {splitDetails.length > 0 && (
        <div style={{ marginBottom: "0.75rem", fontSize: "0.85rem", color: "#065" }}>
          <div style={{ fontWeight: 600 }}>{t("eventDetail.splitInfoTitle")}</div>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
            {splitDetails.map((s, i) => (
              <li key={i}>
                {t("eventDetail.splitInfoItem", {
                  filename: s.originalFilename,
                  pageCount: String(s.pageCount),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {duplicateDetails.length > 0 && (
        <div style={{ marginBottom: "0.75rem", fontSize: "0.85rem", color: "#a60" }}>
          <div style={{ fontWeight: 600 }}>{t("eventDetail.duplicatesTitle")}</div>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
            {duplicateDetails.map((d, i) => (
              <li key={i}>
                {t("eventDetail.duplicateItem", {
                  filename: d.filename,
                  existingFilename: d.existingFilename,
                  existingDate: new Date(d.existingCreatedAt).toLocaleDateString("cs-CZ"),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {failureDetails.length > 0 && (
        <div style={{ marginBottom: "1rem", fontSize: "0.85rem", color: "#c00" }}>
          <div style={{ fontWeight: 600 }}>{t("eventDetail.failuresTitle")}</div>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
            {failureDetails.map((f, i) => (
              <li key={i}>
                {f.error === "invalid_pdf"
                  ? t("eventDetail.failureInvalidPdf", { filename: f.filename })
                  : `${f.filename}: ${f.error}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button
          onClick={() => setStatusFilter(null)}
          style={{
            padding: "0.35rem 0.75rem",
            borderRadius: 999,
            border: statusFilter === null ? "1px solid #111" : "1px solid #ccc",
            background: statusFilter === null ? "#111" : "#fff",
            color: statusFilter === null ? "#fff" : "#111",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          {t("billsPage.filterAll")} ({bills.length})
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: 999,
              border: statusFilter === s ? "1px solid #111" : "1px solid #ccc",
              background: statusFilter === s ? "#111" : "#fff",
              color: statusFilter === s ? "#fff" : "#111",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            {statusLabels[s]} ({counts[s]})
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            padding: "0.6rem 0.85rem",
            marginBottom: "1rem",
            background: "#f5f7fa",
            border: "1px solid #dde3ea",
            borderRadius: 6,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>
            {t("billsPage.selectedCount", { count: String(selected.size) })}
          </span>
          <button
            onClick={() => runBulk("approve")}
            disabled={bulkRunning}
            style={{ padding: "0.4rem 0.85rem", background: "#111", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.85rem" }}
          >
            {t("billsPage.bulkApprove")}
          </button>
          <button
            onClick={runBulkAi}
            disabled={hasActiveAiRun}
            style={{ padding: "0.4rem 0.85rem", background: "#111", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.85rem" }}
          >
            {hasActiveAiRun ? t("billModal.aiProcessing") : t("billModal.aiReprocess")}
          </button>
          <button
            onClick={() => runBulk("delete")}
            disabled={bulkRunning}
            style={{ padding: "0.4rem 0.85rem", background: "#fff", color: "#c00", border: "1px solid #c00", borderRadius: 4, cursor: "pointer", fontSize: "0.85rem" }}
          >
            {t("billsPage.bulkDelete")}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: "0.85rem", textDecoration: "underline" }}
          >
            {t("billsPage.clearSelection")}
          </button>
          {bulkRunning && <span style={{ color: "#666", fontSize: "0.85rem" }}>{t("common.loading")}</span>}
        </div>
      )}

      {hasActiveAiRun && (
        <p style={{ color: "#666", marginBottom: "0.5rem", fontSize: "0.9rem" }}>
          {t("billsPage.bulkAiActive", { count: String(aiActiveCount) })}
        </p>
      )}

      {bulkMessage && <p style={{ color: "#080", marginBottom: "0.5rem" }}>{bulkMessage}</p>}

      {bulkFailures.length > 0 && (
        <div style={{ marginBottom: "1rem", fontSize: "0.85rem", color: "#a60" }}>
          <div style={{ fontWeight: 600 }}>{t("billsPage.bulkFailuresTitle")}</div>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
            {bulkFailures.map((f) => (
              <li key={f.billId}>{bulkFailureText(f)}</li>
            ))}
          </ul>
        </div>
      )}

      {filteredBills.length === 0 ? (
        <p>{t("eventDetail.billsEmpty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "0.5rem", width: 32 }}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                />
              </th>
              <th style={{ padding: "0.5rem" }}>{t("eventDetail.colFilename")}</th>
              <th style={{ padding: "0.5rem" }}>{t("common.status")}</th>
              <th style={{ padding: "0.5rem" }}>{t("billsPage.colMerchant")}</th>
              <th style={{ padding: "0.5rem" }}>{t("billModal.payer")}</th>
              <th style={{ padding: "0.5rem" }}>{t("eventDetail.colCategory")}</th>
              <th style={{ padding: "0.5rem" }}>{t("billsPage.colAmount")}</th>
              <th style={{ padding: "0.5rem" }}>{t("billModal.date")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredBills.map((b) => (
              <tr key={b.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={selected.has(b.id)}
                    onChange={() => toggleSelect(b.id)}
                    disabled={isAiLocked(b)}
                  />
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {isAiLocked(b) ? (
                    <span style={{ color: "#999" }}>{b.originalFilename}</span>
                  ) : (
                    <a href={billHref(b.id)} style={{ color: "#0645AD", cursor: "pointer" }}>
                      {b.originalFilename}
                    </a>
                  )}
                </td>
                <td style={{ padding: "0.5rem" }}>{statusLabels[b.status] || b.status}</td>
                <td style={{ padding: "0.5rem" }}>{b.merchantName || "—"}</td>
                <td style={{ padding: "0.5rem" }}>{b.payerAuthor?.canonicalName ?? "Akce"}</td>
                <td style={{ padding: "0.5rem" }}>
                  {b.categories.length > 0
                    ? b.categories.map((c) => c.eventCategory.name).join(", ")
                    : "—"}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {b.totalAmount === null ? (
                    "—"
                  ) : (
                    <>
                      {parseFloat(b.totalAmount).toLocaleString("cs-CZ")} {b.currency}
                      {b.currency !== "CZK" && (
                        <div style={{ fontSize: "0.8rem", color: b.amountCzk ? "#666" : "#a60" }}>
                          {b.amountCzk
                            ? `= ${parseFloat(b.amountCzk).toLocaleString("cs-CZ")} Kč`
                            : t("billsPage.noRate")}
                        </div>
                      )}
                    </>
                  )}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {b.billDate ? new Date(b.billDate).toLocaleDateString("cs-CZ") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} style={{ padding: "0.5rem", fontWeight: 600 }}>
                {t("billsPage.colTotal")}
              </td>
              <td style={{ padding: "0.5rem", fontWeight: 600 }}>
                {runningTotal.toLocaleString("cs-CZ")} Kč
                {unconvertedCount > 0 && (
                  <div style={{ fontSize: "0.8rem", color: "#a60", fontWeight: 400 }}>
                    {t("billsPage.totalExcludes", { count: String(unconvertedCount) })}
                  </div>
                )}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
