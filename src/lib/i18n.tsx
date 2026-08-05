"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Lang = "cs" | "en";
type TranslationsMap = Record<string, { cs: string; en: string }>;

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  currentEventId: string | null;
  setCurrentEventId: (id: string | null) => void;
  t: (key: string, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("cs");
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [translations, setTranslations] = useState<TranslationsMap>({});

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
    <I18nContext.Provider value={{ lang, setLang, t, currentEventId, setCurrentEventId }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslations() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslations must be used within I18nProvider");
  return ctx;
}
