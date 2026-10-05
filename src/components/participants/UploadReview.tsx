"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";

// Review of one portal upload (docs/registration-slice4-spec.md 7): open /
// download the file, Schválit, or Zamítnout with a short reason (the parent
// sees it in the portal). Used on the participant detail and the per-event
// "Nahrané dokumenty ke kontrole" list. No e-mail either way.
export function UploadReviewActions({ eventId, docId, onDone }: { eventId: string; docId: string; onDone: () => void }) {
  const { t } = useTranslations();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const file = `/api/events/${eventId}/documents/${docId}`;

  async function review(action: "approve" | "reject") {
    setBusy(true);
    setError(false);
    const res = await fetch(file, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(true);
    setRejecting(false);
    onDone();
  }

  const link = "text-ember hover:underline";
  return (
    <span className="flex flex-wrap items-center gap-2 text-[12.5px]">
      <a href={`${file}?inline=1`} target="_blank" rel="noreferrer" className={link}>
        {t("uploadReview.open")}
      </a>
      <a href={file} className={link}>
        {t("uploadReview.download")}
      </a>
      {rejecting ? (
        <>
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder={t("uploadReview.reason")}
            className="w-56 rounded border border-mist bg-paper-2 px-2 py-0.5 text-[12.5px] text-ink"
          />
          <button type="button" onClick={() => review("reject")} disabled={busy || !note.trim()} className="rounded-full bg-red-600 px-2 py-0.5 text-white disabled:opacity-50">
            {t("uploadReview.reject")}
          </button>
          <button type="button" onClick={() => setRejecting(false)} className="text-ink-secondary hover:text-ink">
            {t("common.cancel")}
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => review("approve")} disabled={busy} className="rounded-full bg-pine/15 px-2 py-0.5 text-pine hover:bg-pine/25 disabled:opacity-50">
            {t("uploadReview.approve")}
          </button>
          <button type="button" onClick={() => setRejecting(true)} disabled={busy} className="rounded-full bg-red-50 px-2 py-0.5 text-red-700 hover:bg-red-100 disabled:opacity-50">
            {t("uploadReview.reject")}
          </button>
        </>
      )}
      {error && <span className="text-red-600">{t("uploadReview.failed")}</span>}
    </span>
  );
}

/** "Nahrané dokumenty ke kontrole (N)" -- a link to the event's review list, shown only when N > 0. */
export function UploadReviewLink({ eventId, className }: { eventId: string; className?: string }) {
  const { t } = useTranslations();
  const [count, setCount] = useState(0);
  useEffect(() => {
    fetch(`/api/events/${eventId}/documents/review?count=1`)
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => setCount(d.count ?? 0))
      .catch(() => {});
  }, [eventId]);
  if (count === 0) return null;
  return (
    <a href={`/events/${eventId}/participants/review`} className={className ?? "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800 hover:bg-amber-100"}>
      {t("uploadReview.listLink", { count: String(count) })}
    </a>
  );
}
