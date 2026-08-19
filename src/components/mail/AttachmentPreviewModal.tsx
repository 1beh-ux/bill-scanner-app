"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import type { MailAttachment } from "./types";

export default function AttachmentPreviewModal({
  eventId,
  messageId,
  attachment,
  onClose,
}: {
  eventId: string;
  messageId: string;
  attachment: MailAttachment;
  onClose: () => void;
}) {
  const { t } = useTranslations();
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const proxyUrl = `/api/events/${eventId}/mail/messages/${messageId}/attachments/${attachment.attachmentId}?mimeType=${encodeURIComponent(
    attachment.mimeType
  )}&filename=${encodeURIComponent(attachment.filename)}`;

  const isImage = attachment.mimeType.startsWith("image/");
  const isPdf = attachment.mimeType === "application/pdf";

  useEffect(() => {
    let cancelled = false;
    setImgSrc(null);
    setError(null);

    if (!isPdf) return;

    async function renderPdf() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const doc = await pdfjsLib.getDocument({ url: proxyUrl }).promise;
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 2 });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas");

        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        if (!cancelled) setImgSrc(canvas.toDataURL("image/png"));
      } catch {
        if (!cancelled) setError(t("attachmentPreview.errorRenderFailed"));
      }
    }
    renderPdf();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxyUrl, isPdf]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-paper p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="truncate text-[15px] font-semibold text-ink">{attachment.filename}</h2>
          <button onClick={onClose} className="shrink-0 text-[13px] text-ink-secondary hover:underline">
            {t("common.close")}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyUrl} alt={attachment.filename} className="max-w-full" />
          ) : isPdf ? (
            error ? (
              <p className="text-[13px] text-red-600">{error}</p>
            ) : imgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imgSrc} alt={attachment.filename} className="max-w-full" />
            ) : (
              <p className="text-[13px] text-ink-secondary">{t("common.loading")}</p>
            )
          ) : (
            <div className="text-[13px] text-ink-secondary">
              <p className="mb-2">{t("attachmentPreview.noInlinePreview")}</p>
              <a href={proxyUrl} target="_blank" rel="noreferrer" className="text-ember hover:underline">
                {t("attachmentPreview.downloadLink")}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
