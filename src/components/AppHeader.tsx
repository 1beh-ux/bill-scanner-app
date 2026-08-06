"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n";

type EventOption = { id: string; name: string; status: string };

export default function AppHeader() {
  const { t, lang, setLang, currentEventId, setCurrentEventId } = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const [events, setEvents] = useState<EventOption[]>([]);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => (r.ok ? r.json() : []))
      .then(setEvents)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const match = pathname.match(/^\/events\/([^/]+)/);
    if (match && match[1] !== currentEventId) {
      setCurrentEventId(match[1]);
    }
  }, [pathname, currentEventId, setCurrentEventId]);

  if (pathname.startsWith("/login")) return null;

  const eventId = currentEventId || events[0]?.id || null;

  function onEventChange(id: string) {
    setCurrentEventId(id);
    router.push(`/events/${id}/bills`);
  }

  const links = [
    { href: eventId ? `/events/${eventId}/bills` : "/events", label: t("nav.bills") },
    { href: eventId ? `/events/${eventId}` : "/events", label: t("nav.eventSetup") },
    { href: "/events", label: t("nav.events") },
    { href: "/authors", label: t("nav.authors") },
    { href: "/category-templates", label: t("nav.categoryTemplates") },
    { href: "/exchange-rates", label: t("nav.exchangeRates") },
  ];

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <span className="app-header-brand">Bill Scanner</span>

        {events.length > 0 && (
          <select
            value={eventId || ""}
            onChange={(e) => onEventChange(e.target.value)}
            className="app-header-select"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
                {ev.status === "closed" ? ` (${t("common.statusClosed")})` : ""}
              </option>
            ))}
          </select>
        )}

        <nav className="app-header-nav">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className={pathname === l.href ? "app-header-link active" : "app-header-link"}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="app-header-lang">
          <button
            onClick={() => setLang("cs")}
            className={lang === "cs" ? "lang-btn active" : "lang-btn"}
          >
            CS
          </button>
          <button
            onClick={() => setLang("en")}
            className={lang === "en" ? "lang-btn active" : "lang-btn"}
          >
            EN
          </button>
        </div>
      </div>
    </header>
  );
}
