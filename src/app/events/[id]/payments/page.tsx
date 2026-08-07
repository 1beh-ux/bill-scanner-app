"use client";

import { useEffect, useState, use, useCallback } from "react";
import QRCode from "qrcode";
import { useTranslations } from "@/lib/i18n";
import { czechAccountToIban, buildSpaydString } from "@/lib/qr-platba";

type EventBasic = { id: string; name: string; status: "active" | "closed" };

type UnpaidRow = {
  authorId: string;
  name: string;
  bankAccountNumber: string | null;
  bankCode: string | null;
  unpaidTotalCzk: string;
  unpaidBillCount: number;
};

export default function EventPaymentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useTranslations();

  const [event, setEvent] = useState<EventBasic | null>(null);
  const [rows, setRows] = useState<UnpaidRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [ibans, setIbans] = useState<Record<string, string | null>>({});

  const [editingAuthorId, setEditingAuthorId] = useState<string | null>(null);
  const [editBankAccountNumber, setEditBankAccountNumber] = useState("");
  const [editBankCode, setEditBankCode] = useState("");
  const [savingBank, setSavingBank] = useState(false);

  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [evRes, unpaidRes] = await Promise.all([
      fetch(`/api/events/${id}`),
      fetch(`/api/events/${id}/unpaid-summary`),
    ]);
    if (evRes.ok) setEvent(await evRes.json());
    if (unpaidRes.ok) setRows(await unpaidRes.json());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // QR codes are generated client-side, matching the tech stack's decision
  // to keep this a browser-side transform with no backend round trip.
  useEffect(() => {
    let cancelled = false;

    async function generate() {
      const newUrls: Record<string, string> = {};
      const newIbans: Record<string, string | null> = {};

      for (const row of rows) {
        if (!row.bankAccountNumber || !row.bankCode) {
          newIbans[row.authorId] = null;
          continue;
        }
        const iban = czechAccountToIban(row.bankAccountNumber, row.bankCode);
        newIbans[row.authorId] = iban;
        if (!iban) continue;

        const amount = parseFloat(row.unpaidTotalCzk || "0");
        if (amount <= 0) continue;

        const spayd = buildSpaydString(iban, amount, `${row.name} ${event?.name ?? ""}`);
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
    const res = await fetch(`/api/authors/${authorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankAccountNumber: editBankAccountNumber.trim() || null,
        bankCode: editBankCode.trim() || null,
      }),
    });
    setSavingBank(false);
    if (!res.ok) {
      setError(t("driveSettings.errorSaveFailed"));
      return;
    }
    setEditingAuthorId(null);
    load();
  }

  async function handleMarkPaid(row: UnpaidRow) {
    if (!window.confirm(t("paymentsPage.markPaidConfirm", { count: String(row.unpaidBillCount), name: row.name })))
      return;
    setMarkingPaidId(row.authorId);
    setError(null);
    const res = await fetch(`/api/events/${id}/mark-paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorId: row.authorId }),
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

  if (loading) return <div style={{ padding: "2rem" }}>{t("common.loading")}</div>;
  if (!event) return <div style={{ padding: "2rem" }}>{t("eventDetail.notFound")}</div>;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem" }}>
      <a href={`/events/${id}`} style={{ color: "#666", textDecoration: "none", fontSize: "0.9rem" }}>
        ← {t("billsPage.back")}
      </a>

      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0.5rem 0 1.5rem" }}>
        {t("paymentsPage.title")} — {event.name}
      </h1>

      {error && <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>}

      {rows.length === 0 ? (
        <p>{t("paymentsPage.empty")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {rows.map((row) => (
            <div
              key={row.authorId}
              style={{
                border: "1px solid #eee",
                borderRadius: 8,
                padding: "1rem",
                display: "flex",
                gap: "1.5rem",
                alignItems: "flex-start",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{row.name}</div>
                <div style={{ color: "#666", fontSize: "0.9rem", marginBottom: "0.5rem" }}>
                  {parseFloat(row.unpaidTotalCzk).toLocaleString("cs-CZ")} Kč · {row.unpaidBillCount}{" "}
                  {t("paymentsPage.colBillCount")}
                </div>

                {editingAuthorId === row.authorId ? (
                  <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      value={editBankAccountNumber}
                      onChange={(e) => setEditBankAccountNumber(e.target.value)}
                      placeholder={t("authors.bankAccountPlaceholder")}
                      style={{ padding: "0.4rem", border: "1px solid #ccc", borderRadius: 4 }}
                    />
                    <input
                      type="text"
                      value={editBankCode}
                      onChange={(e) => setEditBankCode(e.target.value)}
                      placeholder={t("authors.bankCodePlaceholder")}
                      style={{ padding: "0.4rem", border: "1px solid #ccc", borderRadius: 4, width: 90 }}
                    />
                    <button
                      onClick={() => saveBankDetails(row.authorId)}
                      disabled={savingBank}
                      style={{ color: "#080", background: "none", border: "none", cursor: "pointer" }}
                    >
                      {t("common.save")}
                    </button>
                    <button
                      onClick={() => setEditingAuthorId(null)}
                      style={{ color: "#666", background: "none", border: "none", cursor: "pointer" }}
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                ) : (
                  <div style={{ marginBottom: "0.5rem" }}>
                    {row.bankAccountNumber ? (
                      <span style={{ fontSize: "0.85rem", color: "#444" }}>
                        {row.bankAccountNumber}/{row.bankCode}
                      </span>
                    ) : (
                      <span style={{ fontSize: "0.85rem", color: "#c00" }}>{t("paymentsPage.noBankDetails")}</span>
                    )}{" "}
                    <button
                      onClick={() => startEditBank(row)}
                      style={{
                        color: "#0645AD",
                        textDecoration: "underline",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}
                    >
                      {t("paymentsPage.editBankButton")}
                    </button>
                  </div>
                )}

                {ibans[row.authorId] && (
                  <div style={{ fontSize: "0.75rem", color: "#888", fontFamily: "monospace" }}>
                    {t("paymentsPage.ibanLabel")}: {ibans[row.authorId]}
                  </div>
                )}

                <button
                  onClick={() => handleMarkPaid(row)}
                  disabled={markingPaidId === row.authorId || event.status === "closed"}
                  style={{
                    marginTop: "0.75rem",
                    padding: "0.4rem 0.8rem",
                    background: "#111",
                    color: "#fff",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  {t("paymentsPage.markPaidButton")}
                </button>
              </div>

              <div style={{ width: 180, textAlign: "center" }}>
                {qrDataUrls[row.authorId] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrls[row.authorId]} alt="QR Platba" width={180} height={180} />
                ) : (
                  <div style={{ fontSize: "0.8rem", color: "#888" }}>{t("paymentsPage.qrUnavailable")}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
