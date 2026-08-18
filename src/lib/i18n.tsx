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
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("cs");
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [translations, setTranslations] = useState<TranslationsMap>({});
  const [role, setRole] = useState<Role | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  // Default "light" here is just the initial render value — the no-flash
  // script in layout.tsx already set the real class on <html> before this
  // ever runs, so the effect below reads that back rather than guessing.
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    if (document.documentElement.classList.contains("dark")) {
      setThemeState("dark");
    }
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    if (t === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    try {
      localStorage.setItem("theme", t);
    } catch {}
  }

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { role: Role } | null) => setRole(data?.role ?? null))
      .catch(() => setRole(null))
      .finally(() => setRoleLoaded(true));
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
      value={{ lang, setLang, t, currentEventId, setCurrentEventId, theme, setTheme, role, roleLoaded }}
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
