"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Settings, Menu, X, Sun, Moon, Tent, ChevronRight } from "lucide-react";
import { useTranslations } from "@/lib/i18n";
import { MENU_ITEMS, MENU_SECTIONS, type MenuSection } from "@/lib/menu-items";
import { useUiPrefs } from "@/lib/use-ui-prefs";
import { pickCurrentEvent, selectableEvents as pickSelectable } from "@/lib/current-event";
import HelpLink from "@/components/HelpLink";

type EventOption = { id: string; name: string; status: string };

// Nápověda topic per section header ("?" link).
const SECTION_HELP: Partial<Record<MenuSection, string>> = { bills: "uctenky", participants: "ucastnici", health: "zdravi", mail: "posta" };

export default function AppSidebar() {
  const { t, lang, setLang, currentEventId, setCurrentEventId, theme, setTheme, role, hiddenModules } =
    useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const [events, setEvents] = useState<EventOption[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moduleAccess, setModuleAccess] = useState<Record<string, boolean>>({});
  const { prefs } = useUiPrefs();
  // Folded sections (click a section name) -- a per-browser convenience.
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("menuCollapsed") ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(stored)) setCollapsed(stored.filter((x) => typeof x === "string"));
    } catch {}
  }, []);

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
  // the dropdown never goes blank. The remembered choice is validated here every
  // time (exists, active, accessible) -- see src/lib/current-event.ts.
  const pathEventId = pathname.match(/^\/events\/([^/]+)/)?.[1] ?? null;
  const selectableEvents = pickSelectable(events, pathEventId);
  const eventId = pickCurrentEvent(events, currentEventId, pathEventId) || currentEventId || null;

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

  // Own-view layer on top of the admin-granted access (see User.hiddenModules).
  const showHealth = moduleAccess.health && !hiddenModules.includes("health");
  const showMail = moduleAccess.mail && !hiddenModules.includes("mail");
  const showPlanning = moduleAccess.planning && !hiddenModules.includes("planning");
  const moduleShown = { health: showHealth, mail: showMail, planning: showPlanning, roster: showHealth || showMail };

  const visibleItems = MENU_ITEMS.filter((i) => (!i.adminOnly || role === "admin") && (!i.module || moduleShown[i.module])).map((i) => ({
    ...i,
    href: i.href(eventId),
    label: t(i.labelKey),
  }));
  const favorites = prefs.menuFavorites.map((id) => visibleItems.find((i) => i.id === id)).filter((i) => i !== undefined);

  function toggleSection(id: string) {
    const next = collapsed.includes(id) ? collapsed.filter((x) => x !== id) : [...collapsed, id];
    setCollapsed(next);
    try {
      localStorage.setItem("menuCollapsed", JSON.stringify(next));
    } catch {}
  }

  function isActive(href: string) {
    return pathname === href;
  }

  function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
    const active = isActive(href);
    return (
      <Link
        href={href}
        className={
          "flex items-center gap-2 rounded-md px-2 py-1 text-[13px] transition-colors " +
          (active
            ? "bg-ember/15 font-medium text-paper"
            : "text-night-fg hover:bg-night-2 hover:text-paper")
        }
      >
        <Icon size={15} className={active ? "text-ember" : "text-night-muted"} aria-hidden="true" />
        {label}
      </Link>
    );
  }

  const sidebarContent = (
    <div className="flex min-h-full flex-col gap-0.5 px-2.5 py-3 [&>*]:shrink-0">
      <div className="flex items-center gap-2 px-1 pb-3">
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
            className="mb-2 w-full rounded-lg border-0 bg-night-2 px-2.5 py-1.5 text-[13px] text-paper focus:outline-none focus:ring-1 focus:ring-ember"
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

      {favorites.length > 0 && (
        <>
          <div className="px-1 pb-0.5 text-[11px] uppercase tracking-wide text-night-muted">{t("nav.favorites")}</div>
          <nav className="flex flex-col">
            {favorites.map((item) => (
              <NavLink key={`fav-${item.id}`} {...item} />
            ))}
          </nav>
          <div className="my-1.5 h-px bg-night-border" />
        </>
      )}

      {MENU_SECTIONS.map((section) => {
        const items = visibleItems.filter((i) => i.section === section.id);
        if (items.length === 0) return null;
        const isCollapsed = section.labelKey !== null && collapsed.includes(section.id);
        return (
          <div key={section.id} className={section.id === "bills" ? "" : "mt-1.5 border-t border-night-border pt-1.5"}>
            {section.labelKey && (
              <div className="flex items-center gap-1.5 px-1 pb-0.5 text-[11px] uppercase tracking-wide text-night-muted">
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={!isCollapsed}
                  className="flex flex-1 items-center gap-1 text-left uppercase hover:text-paper"
                >
                  <ChevronRight size={12} className={"transition-transform " + (isCollapsed ? "" : "rotate-90")} aria-hidden="true" />
                  {t(section.labelKey)}
                </button>
                {SECTION_HELP[section.id] && <HelpLink slug={SECTION_HELP[section.id]!} className="hover:text-paper" />}
              </div>
            )}
            {!isCollapsed && (
              <nav className="flex flex-col">
                {items.map((item) => (
                  <NavLink key={item.id} {...item} />
                ))}
              </nav>
            )}
          </div>
        );
      })}

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
      <aside className="scrollbar-none hidden w-56 shrink-0 overflow-y-auto border-r border-night-border bg-night md:sticky md:top-0 md:flex md:h-screen print:!hidden">
        {sidebarContent}
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-night-border bg-night px-4 py-3 md:hidden print:hidden">
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
          <div className="scrollbar-none absolute left-0 top-0 h-full w-64 overflow-y-auto overscroll-contain bg-night shadow-lg">
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
