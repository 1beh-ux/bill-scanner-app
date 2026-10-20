"use client";

import { useCallback } from "react";
import { MarkdownText } from "@/components/registration/Markdown";
import { OrgFooter, OrgName, type PublicOrg } from "@/components/registration/OrgBrand";
import ThemeToggle from "@/components/registration/ThemeToggle";
import TicketForm, { type SaleType } from "@/components/tickets/TicketForm";
import { withTicketTexts } from "@/lib/tickets";

// /r/<slug> of a public event (docs/public-event-tickets-spec.md): the event info + the ticket form.
const date = (d: string) => new Date(d).toLocaleDateString("cs-CZ", { timeZone: "UTC" });

export default function TicketPage({
  slug,
  event,
  types,
  maxPerOrder,
  texts,
  showLeft,
  org,
  embed,
  strings,
}: {
  slug: string;
  event: { name: string; startDate: string; endDate: string; location: string | null; landingContent: string | null; hideHeader: boolean; registrationDeadline: string | null };
  types: SaleType[];
  maxPerOrder: number;
  texts: Record<string, string>;
  showLeft: boolean;
  org: PublicOrg;
  embed: boolean;
  strings: Record<string, string>;
}) {
  const t = useCallback(
    (key: string, vars?: Record<string, string>) =>
      withTicketTexts((k, v) => {
        let s = strings[k] ?? k;
        for (const [n, x] of Object.entries(v ?? {})) s = s.replace(`{${n}}`, x);
        return s;
      }, texts)(key, vars),
    [strings, texts]
  );
  const when = date(event.startDate) === date(event.endDate) ? date(event.startDate) : `${date(event.startDate)} – ${date(event.endDate)}`;
  return (
    <div className="pub-container mx-auto w-full max-w-2xl p-4 pb-16">
      <ThemeToggle label={t("portal.toggleTheme")} />
      {/* "Skrýt nadpis" (event setting): the embedding page has its own. */}
      {!event.hideHeader && (
        <>
          <OrgName org={org} />
          <p className="text-[12px] uppercase tracking-wide text-ink-secondary">{t("ticketForm.kicker")}</p>
          <h1 className="mt-1 text-[24px] font-semibold text-ink">{event.name}</h1>
          <p className="mb-4 text-[14px] text-ink-secondary">
            {when}
            {event.location && ` · ${event.location}`}
            {event.registrationDeadline && ` · ${t("ticketForm.salesUntil", { date: date(event.registrationDeadline) })}`}
          </p>
        </>
      )}
      {event.landingContent && <MarkdownText text={event.landingContent} className="mb-6 rounded-lg border border-mist bg-paper p-4 text-[15px] leading-relaxed text-ink" />}
      <TicketForm types={types} maxPerOrder={maxPerOrder} submitUrl={`/api/public/r/${slug}/tickets`} embed={embed} showLeft={showLeft} t={t} />
      <OrgFooter org={org} label={t("portal.contact")} />
    </div>
  );
}
