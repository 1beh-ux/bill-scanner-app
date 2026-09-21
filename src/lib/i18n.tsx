"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Lang = "cs" | "en";
type Theme = "light" | "dark";
type Role = "admin" | "accountant" | "user";
type TranslationsMap = Record<string, { cs: string; en: string }>;

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  currentEventId: string | null;
  setCurrentEventId: (id: string | null) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  t: (key: string, vars?: Record<string, string>) => string;
  role: Role | null;
  roleLoaded: boolean;
  hiddenModules: string[];
  setHiddenModules: (m: string[]) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const TRANSLATIONS_CACHE_KEY = "translations-cache-v1";
const CURRENT_EVENT_KEY = "currentEventId";

function readCachedTranslations(): TranslationsMap {
  try {
    const raw = sessionStorage.getItem(TRANSLATIONS_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Seeded from localStorage so a hard reload shows the right language
// immediately, before /api/me's real (per-user, cross-device) value comes
// back and reconciles it -- same instant-paint idea as the theme
// no-flash script in layout.tsx, just done in React state since language
// doesn't need to avoid a paint flash the way a dark/light class does.
function readCachedLang(): Lang {
  try {
    return localStorage.getItem("lang") === "en" ? "en" : "cs";
  } catch {
    return "cs";
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readCachedLang);
  const [currentEventId, setCurrentEventIdState] = useState<string | null>(null);

  // The switcher's event is remembered across reloads (and kept on organisation pages).
  // Restored after mount -- not in the initial state -- so server and client render the same.
  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const stored = localStorage.getItem(CURRENT_EVENT_KEY);
        if (stored) setCurrentEventIdState((cur) => cur ?? stored);
      } catch {}
    });
  }, []);

  function setCurrentEventId(id: string | null) {
    setCurrentEventIdState(id);
    try {
      if (id) localStorage.setItem(CURRENT_EVENT_KEY, id);
      else localStorage.removeItem(CURRENT_EVENT_KEY);
    } catch {}
  }
  // Seeded from sessionStorage so a hard navigation shows real text instead of
  // raw i18n keys while the fresh fetch below is still in flight.
  const [translations, setTranslations] = useState<TranslationsMap>(readCachedTranslations);
  const [role, setRole] = useState<Role | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  // Default "light" here is just the initial render value — the no-flash
  // script in layout.tsx already set the real class on <html> before this
  // ever runs, so the effect below reads that back rather than guessing.
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    if (document.documentElement.classList.contains("dark")) {
      setThemeState("dark");
    }
  }, []);

  function setTheme(t: Theme, persistToServer = true) {
    setThemeState(t);
    if (t === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    try {
      localStorage.setItem("theme", t);
    } catch {}
    if (persistToServer) {
      fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredTheme: t }),
      }).catch(() => {});
    }
  }

  function setLang(l: Lang, persistToServer = true) {
    setLangState(l);
    try {
      localStorage.setItem("lang", l);
    } catch {}
    if (persistToServer) {
      fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredLang: l }),
      }).catch(() => {});
    }
  }

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { role: Role; preferredLang?: Lang; preferredTheme?: Theme; hiddenModules?: string[] } | null) => {
        setRole(data?.role ?? null);
        setHiddenModules(data?.hiddenModules ?? []);
        // Reconcile to the server's values without re-PATCHing them right
        // back -- this is the server telling the client, not a user action.
        if (data?.preferredLang) setLang(data.preferredLang, false);
        if (data?.preferredTheme) setTheme(data.preferredTheme, false);
      })
      .catch(() => setRole(null))
      .finally(() => setRoleLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/translations")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: { key: string; cs: string; en: string }[]) => {
        const map: TranslationsMap = {};
        for (const row of data) {
          map[row.key] = { cs: row.cs, en: row.en };
        }
        setTranslations(map);
        try {
          sessionStorage.setItem(TRANSLATIONS_CACHE_KEY, JSON.stringify(map));
        } catch {}
      })
      .catch(() => {});
  }, []);

  function t(key: string, vars?: Record<string, string>) {
    const entry = translations[key];
    let text = entry ? entry[lang] : key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replace(`{${k}}`, v);
      }
    }
    return text;
  }

  return (
    <I18nContext.Provider
      value={{ lang, setLang, t, currentEventId, setCurrentEventId, theme, setTheme, role, roleLoaded, hiddenModules, setHiddenModules }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslations() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslations must be used within I18nProvider");
  return ctx;
}
