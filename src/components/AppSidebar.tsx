"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  FileText,
  BarChart3,
  QrCode,
  Settings,
  Users,
  Menu,
  X,
  Sun,
  Moon,
  Tent,
  Upload,
  HeartPulse,
  Pill,
  Mail,
} from "lucide-react";
import { useTranslations } from "@/lib/i18n";
import { NAV_SECTIONS, visibleNavSections } from "@/lib/nav-sections";

type EventOption = { id: string; name: string; status: string };

export default function AppSidebar() {
  const { t, lang, setLang, currentEventId, setCurrentEventId, theme, setTheme, role, hiddenModules } =
    useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const [events, setEvents] = useState<EventOption[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moduleAccess, setModuleAccess] = useState<Record<string, boolean>>({});

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

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Only active events are offered. A closed event stays listed only while
  // you're actually on it (e.g. an admin opened it from the events page), so
  // the dropdown never goes blank; a stale remembered closed event falls back
  // to the first active one.
  const pathEventId = pathname.match(/^\/events\/([^/]+)/)?.[1];
  const selectableEvents = events.filter((ev) => ev.status === "active" || ev.id === pathEventId);
  const eventId =
    (selectableEvents.some((ev) => ev.id === currentEventId) ? currentEventId : selectableEvents[0]?.id) ||
    currentEventId ||
    null;

  useEffect(() => {
    if (!eventId) {
      setModuleAccess({});
      return;
    }
    fetch(`/api/events/${eventId}/modules/mine`)
      .then((r) => (r.ok ? r.json() : {}))
      .then(setModuleAccess)
      .catch(() => setModuleAccess({}));
  }, [eventId]);

  if (pathname.startsWith("/login")) return null;

  function onEventChange(id: string) {
    setCurrentEventId(id);
    const sectionMatch = pathname.match(/^\/events\/[^/]+\/([^/]+)/);
    if (sectionMatch) {
      router.push(`/events/${id}/${sectionMatch[1]}`);
    } else if (/^\/events\/[^/]+$/.test(pathname)) {
      router.push(`/events/${id}`);
    }
    // Otherwise we're on a non-event page (e.g. /users) — just switch the
    // context so event-scoped links pick up the new id, stay put otherwise.
  }

  const billsNavItems = [
    { href: eventId ? `/events/${eventId}/import` : "/events", label: t("nav.import"), icon: Upload },
    { href: eventId ? `/events/${eventId}/bills` : "/events", label: t("nav.bills"), icon: FileText },
    { href: eventId ? `/events/${eventId}/budget` : "/events", label: t("nav.budget"), icon: BarChart3 },
    { href: eventId ? `/events/${eventId}/payments` : "/events", label: t("nav.payments"), icon: QrCode },
    { href: eventId ? `/events/${eventId}/payers` : "/events", label: t("nav.payers"), icon: Users },
    ...NAV_SECTIONS.bills.items
      .filter((item) => !item.adminOnly || role === "admin")
      .map((item) => ({ href: item.path, label: t(item.labelKey), icon: item.icon })),
  ];

  // Own-view layer on top of the admin-granted access (see User.hiddenModules).
  const showHealth = moduleAccess.health && !hiddenModules.includes("health");
  const showMail = moduleAccess.mail && !hiddenModules.includes("mail");

  const participantsNavItems = [
    ...(showHealth || showMail
      ? [
          {
            href: eventId ? `/events/${eventId}/participants` : "/events",
            label: t("participantsPage.centralTitle"),
            icon: Users,
          },
        ]
      : []),
  ];

  const healthNavItems = [
    ...(showHealth
      ? [
          { href: eventId ? `/events/${eventId}/health` : "/events", label: t("nav.health"), icon: HeartPulse },
          {
            href: eventId ? `/events/${eventId}/health/meds` : "/events",
            label: t("medChecklistPage.title"),
            icon: Pill,
          },
        ]
      : []),
  ];

  const mailNavItems = [
    ...(showMail
      ? [
          { href: eventId ? `/events/${eventId}/mail` : "/events", label: t("nav.mail"), icon: Mail },
          {
            href: eventId ? `/events/${eventId}/mail/participants` : "/events",
            label: t("participantsPage.mailListTitle"),
            icon: Users,
          },
        ]
      : []),
  ];

  const eventSettingsItem = {
    href: eventId ? `/events/${eventId}` : "/events",
    label: t("nav.eventSetup"),
    icon: Settings,
  };

  const orgNavItems = visibleNavSections(role)
    .find((s) => s.sectionLabelKey === NAV_SECTIONS.organization.sectionLabelKey)
    ?.items.map((item) => ({ href: item.path, label: t(item.labelKey), icon: item.icon })) ?? [];

  function isActive(href: string) {
    return pathname === href;
  }

  function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
    const active = isActive(href);
    return (
      <Link
        href={href}
        className={
          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors " +
          (active
            ? "bg-ember/15 font-medium text-paper"
            : "text-night-fg hover:bg-night-2 hover:text-paper")
        }
      >
        <Icon size={16} className={active ? "text-ember" : "text-night-muted"} aria-hidden="true" />
        {label}
      </Link>
    );
  }

  const sidebarContent = (
    <div className="flex h-full flex-col gap-1 px-3 py-4">
      <div className="flex items-center gap-2 px-1 pb-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ember">
          <Tent size={16} className="text-night" aria-hidden="true" />
        </div>
        <span className="text-[14px] font-medium text-paper">Bill Scanner</span>
      </div>

      {selectableEvents.length > 0 && (
        <>
          <div className="px-1 pb-1 text-[11px] uppercase tracking-wide text-night-muted">
            {t("nav.currentEvent")}
          </div>
          <select
            value={eventId || ""}
            onChange={(e) => onEventChange(e.target.value)}
            className="mb-4 w-full rounded-lg border-0 bg-night-2 px-2.5 py-2 text-[13px] text-paper focus:outline-none focus:ring-1 focus:ring-ember"
          >
            {selectableEvents.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
                {ev.status === "closed" ? ` (${t("common.statusClosed")})` : ""}
              </option>
            ))}
          </select>
        </>
      )}

      <div className="px-1 pb-1 text-[11px] uppercase tracking-wide text-night-muted">
        {t("nav.sectionBills")}
      </div>
      <nav className="flex flex-col gap-0.5">
        {billsNavItems.map((item) => (
          <NavLink key={item.label} {...item} />
        ))}
      </nav>

      {participantsNavItems.length > 0 && (
        <>
          <div className="my-3 h-px bg-night-border" />
          <div className="px-1 pb-1 text-[11px] uppercase tracking-wide text-night-muted">
            {t("nav.sectionParticipants")}
          </div>
          <nav className="flex flex-col gap-0.5">
            {participantsNavItems.map((item) => (
              <NavLink key={item.label} {...item} />
            ))}
          </nav>
        </>
      )}

      {healthNavItems.length > 0 && (
        <>
          <div className="my-3 h-px bg-night-border" />
          <div className="px-1 pb-1 text-[11px] uppercase tracking-wide text-night-muted">
            {t("nav.sectionHealth")}
          </div>
          <nav className="flex flex-col gap-0.5">
            {healthNavItems.map((item) => (
              <NavLink key={item.label} {...item} />
            ))}
          </nav>
        </>
      )}

      {mailNavItems.length > 0 && (
        <>
          <div className="my-3 h-px bg-night-border" />
          <div className="px-1 pb-1 text-[11px] uppercase tracking-wide text-night-muted">
            {t("nav.sectionMail")}
          </div>
          <nav className="flex flex-col gap-0.5">
            {mailNavItems.map((item) => (
              <NavLink key={item.label} {...item} />
            ))}
          </nav>
        </>
      )}

      <div className="my-3 h-px bg-night-border" />

      <nav className="flex flex-col gap-0.5">
        <NavLink {...eventSettingsItem} />
      </nav>

      {orgNavItems.length > 0 && (
        <>
          <div className="my-3 h-px bg-night-border" />

          <div className="px-1 pb-1 text-[11px] uppercase tracking-wide text-night-muted">
            {t("nav.organization")}
          </div>
          <nav className="flex flex-col gap-0.5">
            {orgNavItems.map((item) => (
              <NavLink key={item.label} {...item} />
            ))}
          </nav>
        </>
      )}

      <div className="flex-1" />

      <div className="my-3 h-px bg-night-border" />

      <div className="flex items-center justify-between px-1">
        <div className="flex gap-1">
          <button
            onClick={() => setLang("cs")}
            className={
              "rounded px-1.5 py-0.5 text-[11px] " +
              (lang === "cs" ? "bg-night-2 text-paper" : "text-night-muted")
            }
          >
            CS
          </button>
          <button
            onClick={() => setLang("en")}
            className={
              "rounded px-1.5 py-0.5 text-[11px] " +
              (lang === "en" ? "bg-night-2 text-paper" : "text-night-muted")
            }
          >
            EN
          </button>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/settings"
            aria-label={t("nav.personalSettings")}
            className="rounded p-1.5 text-night-muted hover:bg-night-2 hover:text-paper"
          >
            <Settings size={15} aria-hidden="true" />
          </Link>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={t("nav.toggleTheme")}
            className="rounded p-1.5 text-night-muted hover:bg-night-2 hover:text-paper"
          >
            {theme === "dark" ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-night-border bg-night md:sticky md:top-0 md:flex md:h-screen">
        {sidebarContent}
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-night-border bg-night px-4 py-3 md:hidden">
        <button onClick={() => setDrawerOpen(true)} aria-label={t("nav.openMenu")} className="text-paper">
          <Menu size={20} aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2">
          <Tent size={16} className="text-ember" aria-hidden="true" />
          <span className="text-[14px] font-medium text-paper">Bill Scanner</span>
        </div>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={t("nav.toggleTheme")}
          className="text-night-muted"
        >
          {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-night shadow-lg">
            <div className="flex justify-end p-2">
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label={t("common.cancel")}
                className="p-1.5 text-night-muted"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
