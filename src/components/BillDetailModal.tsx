"use client";

import { useEffect, useState } from "react";
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

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json();
  } catch {
    return { error: `HTTP ${res.status}` };
  }
}

export default function BillDetailModal({
  billId,
  eventCategories,
  authors,
  onClose,
  onSaved,
  onNavigate,
  hasPrev,
  hasNext,
}: {
  billId: string;
  eventCategories: EventCategory[];
  authors: Author[];
  onClose: () => void;
  onSaved: () => void;
  onNavigate: (direction: "prev" | "next") => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const { t } = useTranslations();

  const [bill, setBill] = useState<BillDetail | null>(null);
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
  const isPdf = bill?.originalFilename.toLowerCase().endsWith(".pdf") ?? false;

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
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft" && hasPrev) onNavigate("prev");
      if (e.key === "ArrowRight" && hasNext) onNavigate("next");
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasPrev, hasNext, onNavigate, onClose]);

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
    onSaved();
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
    if (hasNext) {
      onNavigate("next");
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
    onSaved();
    if (hasNext) {
      onNavigate("next");
    } else {
      onClose();
    }
  }

  async function handleReopen() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/bills/${billId}/approve`, { method: "DELETE" });
    setSaving(false);
    if (res.ok) {
      onSaved();
      load();
    } else {
      setError(t("billModal.error.reopenFailed"));
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.4rem",
    border: "1px solid #ccc",
    borderRadius: 4,
    fontSize: "0.9rem",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.8rem",
    color: "#666",
    marginBottom: "0.2rem",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 8,
          maxWidth: 1000,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          padding: "1.5rem",
        }}
      >
        {loading || !bill ? (
          <p>{t("common.loading")}</p>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              <div>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>
                  {bill.originalFilename}
                </h2>
                <span
                  style={{
                    display: "inline-block",
                    marginTop: "0.35rem",
                    padding: "0.15rem 0.6rem",
                    borderRadius: 999,
                    fontSize: "0.8rem",
                    background: isApproved ? "#e6f4ea" : "#f1f3f4",
                    color: isApproved ? "#080" : "#444",
                    border: isApproved ? "1px solid #b7dfc4" : "1px solid #ddd",
                  }}
                >
                  {t(`billsPage.status${bill.status.replace(/_(.)/g, (_m, x) => x.toUpperCase()).replace(/^./, (x) => x.toUpperCase())}`)}
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                <button
                  onClick={() => onNavigate("prev")}
                  disabled={!hasPrev}
                  title={t("billModal.prev")}
                  style={{ padding: "0.3rem 0.6rem", background: "#fff", border: "1px solid #ccc", borderRadius: 4, cursor: hasPrev ? "pointer" : "default", opacity: hasPrev ? 1 : 0.4 }}
                >
                  ‹
                </button>
                <button
                  onClick={() => onNavigate("next")}
                  disabled={!hasNext}
                  title={t("billModal.next")}
                  style={{ padding: "0.3rem 0.6rem", background: "#fff", border: "1px solid #ccc", borderRadius: 4, cursor: hasNext ? "pointer" : "default", opacity: hasNext ? 1 : 0.4 }}
                >
                  ›
                </button>
                <button
                  onClick={onClose}
                  style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", lineHeight: 1, marginLeft: "0.25rem" }}
                >
                  ×
                </button>
              </div>
            </div>

            {error && <p style={{ color: "#c00", marginBottom: "0.75rem" }}>{error}</p>}
            {message && <p style={{ color: "#080", marginBottom: "0.75rem" }}>{message}</p>}

            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 320px", minWidth: 300 }}>
                {isPdf ? (
                  <iframe
                    src={`/api/bills/${bill.id}/file?v=${bill.contentHash}`}
                    title={bill.originalFilename}
                    style={{ width: "100%", height: 480, border: "1px solid #eee", borderRadius: 4 }}
                  />
                ) : (
                  <a href={`/api/bills/${bill.id}/file`} target="_blank" rel="noreferrer">
                    <img
                      src={`/api/bills/${bill.id}/file?v=${bill.contentHash}`}
                      alt={bill.originalFilename}
                      style={{ width: "100%", border: "1px solid #eee", borderRadius: 4 }}
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
                  style={{ display: "inline-block", marginTop: "0.5rem", fontSize: "0.85rem", color: "#0645AD" }}
                >
                  {t("billModal.openFile")}
                </a>
                {!isPdf && !isApproved && (
                  <button
                    onClick={() => setEditingImage(true)}
                    style={{ display: "block", marginTop: "0.4rem", background: "none", border: "none", color: "#0645AD", textDecoration: "underline", cursor: "pointer", fontSize: "0.85rem", padding: 0 }}
                  >
                    {t("imageEditor.openButton")}
                  </button>
                )}
              </div>

              <div style={{ flex: "1 1 320px", minWidth: 300, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div>
                  <label style={labelStyle}>{t("billModal.merchant")}</label>
                  <input
                    type="text"
                    value={merchantName}
                    onChange={(e) => setMerchantName(e.target.value)}
                    disabled={isApproved}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>{t("billModal.date")}</label>
                    <input
                      type="date"
                      value={billDate}
                      onChange={(e) => setBillDate(e.target.value)}
                      disabled={isApproved}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>{t("billModal.amount")}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                      disabled={isApproved}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ width: 90 }}>
                    <label style={labelStyle}>{t("billModal.currency")}</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      disabled={isApproved}
                      style={inputStyle}
                    >
                      <option value="CZK">CZK</option>
                      <option value="PLN">PLN</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>

                {currency !== "CZK" && (
                  <div style={{ fontSize: "0.85rem", color: bill.amountCzk ? "#065" : "#a60" }}>
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
                  <label style={labelStyle}>{t("billModal.payer")}</label>
                  <select
                    value={payerAuthorId}
                    onChange={(e) => setPayerAuthorId(e.target.value)}
                    disabled={isApproved}
                    style={inputStyle}
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
                  <label style={labelStyle}>{t("billModal.notes")}</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={isApproved}
                    rows={2}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ ...labelStyle, fontWeight: 600, color: "#111" }}>
                    {t("billModal.splitTitle")}
                  </label>

                  {splits.map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: "0.35rem", marginBottom: "0.35rem", alignItems: "center" }}>
                      <select
                        value={s.eventCategoryId}
                        onChange={(e) => updateSplit(i, { eventCategoryId: e.target.value })}
                        disabled={isApproved}
                        style={{ ...inputStyle, flex: 1 }}
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
                        style={{ ...inputStyle, width: 110 }}
                      />
                      {!isApproved && (
                        <>
                          <button
                            onClick={() => fillRemainder(i)}
                            title={t("billModal.fillRemainder")}
                            style={{ background: "none", border: "none", color: "#0645AD", cursor: "pointer", fontSize: "0.8rem" }}
                          >
                            =
                          </button>
                          <button
                            onClick={() => removeSplit(i)}
                            style={{ background: "none", border: "none", color: "#c00", cursor: "pointer" }}
                          >
                            ×
                          </button>
                        </>
                      )}
                    </div>
                  ))}

                  {!isApproved && (
                    <button
                      onClick={addSplit}
                      style={{ background: "none", border: "none", color: "#0645AD", textDecoration: "underline", cursor: "pointer", fontSize: "0.85rem", padding: 0 }}
                    >
                      + {t("billModal.addSplit")}
                    </button>
                  )}

                  {splits.length > 0 && (
                    <div
                      style={{
                        marginTop: "0.5rem",
                        fontSize: "0.85rem",
                        color: splitsMatch ? "#080" : "#c00",
                      }}
                    >
                      {splitsMatch
                        ? t("billModal.splitOk")
                        : t("billModal.splitDiff", {
                            splitTotal: splitTotal.toFixed(2),
                            difference: difference.toFixed(2),
                          })}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  {isApproved ? (
                    <button
                      onClick={handleReopen}
                      disabled={saving}
                      style={{ padding: "0.5rem 1rem", background: "#fff", color: "#111", border: "1px solid #111", borderRadius: 4, cursor: "pointer" }}
                    >
                      {t("billModal.reopen")}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleSaveAndNext}
                        disabled={saving}
                        style={{ padding: "0.5rem 1rem", background: "#fff", color: "#111", border: "1px solid #111", borderRadius: 4, cursor: "pointer" }}
                      >
                        {hasNext ? t("billModal.saveAndNext") : t("common.save")}
                      </button>
                      <button
                        onClick={handleSaveOnly}
                        disabled={saving}
                        style={{ padding: "0.5rem 1rem", background: "#fff", color: "#666", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }}
                      >
                        {t("billModal.saveAndStay")}
                      </button>
                      <button
                        onClick={handleApprove}
                        disabled={saving}
                        style={{ padding: "0.5rem 1rem", background: "#111", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
                      >
                        {t("billModal.approve")}
                      </button>
                    </>
                  )}
                  <button
                    disabled
                    title={t("billModal.aiReprocessSoon")}
                    style={{ padding: "0.5rem 1rem", background: "#f5f5f5", color: "#999", border: "1px solid #ddd", borderRadius: 4, cursor: "not-allowed" }}
                  >
                    {t("billModal.aiReprocess")}
                  </button>
                  {saving && <span style={{ alignSelf: "center", color: "#666", fontSize: "0.85rem" }}>{t("common.loading")}</span>}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      {editingImage && bill && (
        <ImageEditor
          billId={bill.id}
          hasOriginal={!!bill.originalGcsObjectPath}
          version={bill.contentHash}
          onClose={() => setEditingImage(false)}
          onSaved={() => { load(); onSaved(); }}
        />
      )}
    </div>
  );
}
