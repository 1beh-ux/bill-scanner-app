"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { UploadReviewActions } from "@/components/participants/UploadReview";

type Upload = { id: string; participantId: string; participantName: string; docTypeName: string; filename: string | null; receivedAt: string };

// "Nahrané dokumenty ke kontrole" (docs/registration-slice4-spec.md 7): every
// portal upload of the event waiting for review, with preview / download and
// Schválit / Zamítnout. Reached from the roster and the Pošta page.
export default function UploadReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslations();
  const [uploads, setUploads] = useState<Upload[] | null>(null);

  const load = useCallback(() => {
    fetch(`/api/events/${id}/documents/review`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setUploads)
      .catch(() => setUploads([]));
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <a href={`/events/${id}/participants`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("participantsPage.centralTitle")}
      </a>
      <h1 className="mb-2 mt-2 text-[22px] font-semibold text-ink">{t("uploadReview.title", { count: String(uploads?.length ?? 0) })}</h1>
      <p className="mb-4 text-[13px] text-ink-secondary">{t("uploadReview.hint")}</p>
      {!uploads ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : uploads.length === 0 ? (
        <p className="text-[14px] text-ink-secondary">{t("uploadReview.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {uploads.map((u) => (
            <li key={u.id} className="flex flex-col gap-1.5 rounded-lg border border-mist bg-paper px-3 py-2 text-[14px]">
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <a href={`/events/${id}/participants/${u.participantId}`} className="font-medium text-ink underline hover:text-ember">
                  {u.participantName}
                </a>
                <span className="text-[12.5px] text-ink-secondary">{new Date(u.receivedAt).toLocaleString("cs-CZ")}</span>
              </span>
              <span className="text-[13px] text-ink-secondary [overflow-wrap:anywhere]">
                {u.docTypeName}
                {u.filename && ` · ${u.filename}`}
              </span>
              <UploadReviewActions eventId={id} docId={u.id} onDone={load} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
