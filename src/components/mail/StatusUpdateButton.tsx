"use client";

import Link from "next/link";
import { useTranslations } from "@/lib/i18n";

/** "Update stavu dokumentů" -- the one entry point to /mail/status-update, used on every page that offers it. */
// With participantId the page opens with just that participant ticked and previewed.
export default function StatusUpdateButton({ eventId, participantId, className }: { eventId: string; participantId?: string; className?: string }) {
  const { t } = useTranslations();
  return (
    <Link
      href={`/events/${eventId}/mail/status-update${participantId ? `?only=${participantId}` : ""}`}
      className={className ?? "rounded-lg border border-mist bg-paper px-4 py-2 text-[14px] text-ink hover:bg-paper-2"}
    >
      {t("statusUpdate.button")}
    </Link>
  );
}
