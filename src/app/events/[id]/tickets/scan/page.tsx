"use client";

import NoAccess from "@/components/NoAccess";
import { use, useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import TicketScanner from "@/components/tickets/TicketScanner";

// Vstupenky -> Vstup: the door check-in for people with the Vstupenky module.
export default function TicketScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslations();
  const [counts, setCounts] = useState<{ paid: number; used: number } | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    fetch(`/api/events/${id}/tickets/scan`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setCounts)
      .catch(() => setDenied(true));
  }, [id]);
  if (denied) return <NoAccess />;
  if (!counts) return <div className="p-8 text-[14px] text-ink-secondary">{t("common.loading")}</div>;
  return (
    <div className="mx-auto max-w-lg p-4 md:p-8">
      <h1 className="mb-4 text-[22px] font-semibold text-ink">{t("tickets.navScan")}</h1>
      <TicketScanner api={`/api/events/${id}/tickets/scan`} t={t} initialCounts={counts} />
    </div>
  );
}
