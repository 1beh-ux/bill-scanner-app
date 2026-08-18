"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

type Preview = { subject: string; recipients: { name: string | null; email: string }[] };

interface SendSummaryModalProps {
  participantId: string;
  onClose: () => void;
  onSent: () => void;
}

const btnPrimary =
  "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";

export default function SendSummaryModal({ participantId, onClose, onSent }: SendSummaryModalProps) {
  const { t } = useTranslations();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/participants/${participantId}/send-preview`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) {
          setError(t("sendSummary.errorLoadFailed"));
          return;
        }
        setPreview(data);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantId]);

  async function handleSend() {
    setSending(true);
    setError(null);
    const res = await fetch(`/api/participants/${participantId}/send-summary`, { method: "POST" });
    setSending(false);
    if (!res.ok) {
      setError(t("sendSummary.errorSendFailed"));
      return;
    }
    const data = await res.json();
    const sentCount = data.results.filter((r: { status: string }) => r.status === "sent").length;
    const failedCount = data.results.length - sentCount;
    setResultMessage(t("sendSummary.resultMessage", { sent: String(sentCount), failed: String(failedCount) }));
    onSent();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-paper p-5">
        <h2 className="mb-4 text-[16px] font-semibold text-ink">{t("sendSummary.title")}</h2>

        {loading ? (
          <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
        ) : resultMessage ? (
          <>
            <p className="mb-4 text-[14px] text-ink">{resultMessage}</p>
            <div className="flex justify-end">
              <button onClick={onClose} className={btnPrimary}>
                {t("common.close")}
              </button>
            </div>
          </>
        ) : preview ? (
          <>
            {preview.recipients.length === 0 ? (
              <p className="mb-4 text-[14px] text-ink-secondary">{t("sendSummary.noRecipients")}</p>
            ) : (
              <>
                <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-ink-secondary">
                  {t("sendSummary.recipientsLabel")}
                </p>
                <ul className="mb-3 list-none p-0 text-[14px] text-ink">
                  {preview.recipients.map((r, i) => (
                    <li key={i}>{r.name ? `${r.name} <${r.email}>` : r.email}</li>
                  ))}
                </ul>

                <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-ink-secondary">
                  {t("sendSummary.subjectLabel")}
                </p>
                <p className="mb-3 text-[14px] text-ink">{preview.subject}</p>

                <a
                  href={`/api/participants/${participantId}/summary-pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="mb-4 inline-block text-[13px] text-ember hover:underline"
                >
                  {t("participantDetail.downloadPdfButton")}
                </a>
              </>
            )}

            {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}

            <div className="mt-2 flex justify-end gap-2">
              <button onClick={onClose} className="text-[13px] text-ink-secondary hover:underline">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSend}
                disabled={sending || preview.recipients.length === 0}
                className={btnPrimary}
              >
                {sending ? t("common.loading") : t("sendSummary.sendButton")}
              </button>
            </div>
          </>
        ) : (
          error && <p className="text-[13px] text-red-600">{error}</p>
        )}
      </div>
    </div>
  );
}
