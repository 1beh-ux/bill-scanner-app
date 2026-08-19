"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { substituteDummyTemplateValues } from "@/lib/email-template-preview";
import { PARENT_SUMMARY_PURPOSE_KEY } from "@/lib/email-template";

export default function TemplatePreviewModal({
  eventId,
  purposeKey = PARENT_SUMMARY_PURPOSE_KEY,
  onClose,
}: {
  eventId: string;
  purposeKey?: string;
  onClose: () => void;
}) {
  const { t } = useTranslations();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}/email-template?purposeKey=${encodeURIComponent(purposeKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) {
          setError(t("sendSummary.errorLoadFailed"));
          return;
        }
        setSubject(data.subject);
        setBody(data.body);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, purposeKey]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-paper p-5">
        <h2 className="mb-1 text-[16px] font-semibold text-ink">{t("templatePreviewModal.title")}</h2>
        <p className="mb-4 text-[13px] text-ink-secondary">{t("templatePreviewModal.hint")}</p>

        {loading ? (
          <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
        ) : error ? (
          <p className="text-[13px] text-red-600">{error}</p>
        ) : (
          <>
            <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-ink-secondary">
              {t("sendSummary.subjectLabel")}
            </p>
            <p className="mb-3 text-[14px] text-ink">{substituteDummyTemplateValues(subject, purposeKey)}</p>

            <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-ink-secondary">
              {t("sendSummary.bodyPreviewLabel")}
            </p>
            <p className="mb-3 whitespace-pre-wrap rounded-lg border border-mist bg-paper-2 p-3 text-[13px] text-ink">
              {substituteDummyTemplateValues(body, purposeKey)}
            </p>
          </>
        )}

        <div className="mt-2 flex justify-end">
          <button onClick={onClose} className="text-[13px] text-ink-secondary hover:underline">
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
