"use client";

import { useEffect, useState, use, useRef, useMemo } from "react";
import { useTranslations } from "@/lib/i18n";
import BillDetailModal from "@/components/BillDetailModal";

type EventDetail = { id: string; name: string };
type EventCategory = { id: string; name: string };
type Author = { id: string; canonicalName: string; active: boolean };

type BillItem = {
  id: string;
  originalFilename: string;
  ingestChannel: "drive" | "upload" | "camera";
  status: string;
  merchantName: string | null;
  totalAmount: string | null;
  amountCzk: string | null;
  billDate: string | null;
  createdAt: string;
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
  const [eventCategories, setEventCategories] = useState<EventCategory[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [openBillId, setOpenBillId] = useState<string | null>(null);
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

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
    const [evRes, billsRes, catRes, authRes] = await Promise.all([
      fetch(`/api/events/${id}`),
      fetch(`/api/events/${id}/bills`),
      fetch(`/api/events/${id}/categories`),
      fetch(`/api/authors`),
    ]);
    if (evRes.ok) setEvent(await evRes.json());
    if (billsRes.ok) setBills(await billsRes.json());
    if (catRes.ok) setEventCategories(await catRes.json());
    if (authRes.ok) setAuthors(await authRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

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
    (sum, b) => sum + parseFloat(b.amountCzk || b.totalAmount || "0"),
    0
  );

  const openIndex = openBillId
    ? filteredBills.findIndex((b) => b.id === openBillId)
    : -1;

  function navigate(direction: "prev" | "next") {
    const t2 = direction === "next" ? openIndex + 1 : openIndex - 1;
    if (t2 >= 0 && t2 < filteredBills.length) {
      setOpenBillId(filteredBills[t2].id);
    }
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
            disabled
            title={t("billModal.aiReprocessSoon")}
            style={{ padding: "0.4rem 0.85rem", background: "#f5f5f5", color: "#999", border: "1px solid #ddd", borderRadius: 4, cursor: "not-allowed", fontSize: "0.85rem" }}
          >
            {t("billModal.aiReprocess")}
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
              <th style={{ padding: "0.5rem" }}>{t("billsPage.colAmount")}</th>
              <th style={{ padding: "0.5rem" }}>{t("eventDetail.colCreated")}</th>
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
                  />
                </td>
                <td
                  onClick={() => setOpenBillId(b.id)}
                  style={{ padding: "0.5rem", color: "#0645AD", cursor: "pointer" }}
                >
                  {b.originalFilename}
                </td>
                <td style={{ padding: "0.5rem" }}>{statusLabels[b.status] || b.status}</td>
                <td style={{ padding: "0.5rem" }}>{b.merchantName || "—"}</td>
                <td style={{ padding: "0.5rem" }}>
                  {b.amountCzk
                    ? `${parseFloat(b.amountCzk).toLocaleString("cs-CZ")} Kč`
                    : b.totalAmount
                      ? `${parseFloat(b.totalAmount).toLocaleString("cs-CZ")}`
                      : "—"}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {new Date(b.createdAt).toLocaleDateString("cs-CZ")}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} style={{ padding: "0.5rem", fontWeight: 600 }}>
                {t("billsPage.colTotal")}
              </td>
              <td style={{ padding: "0.5rem", fontWeight: 600 }}>
                {runningTotal.toLocaleString("cs-CZ")} Kč
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      )}

      {openBillId && (
        <BillDetailModal
          billId={openBillId}
          eventCategories={eventCategories}
          authors={authors}
          onClose={() => setOpenBillId(null)}
          onSaved={load}
          onNavigate={navigate}
          hasPrev={openIndex > 0}
          hasNext={openIndex >= 0 && openIndex < filteredBills.length - 1}
        />
      )}
    </div>
  );
}