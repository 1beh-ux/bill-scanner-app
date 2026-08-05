"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Lang = "cs" | "en";
type TranslationsMap = Record<string, { cs: string; en: string }>;

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("cs");
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
    <I18nContext.Provider value={{ lang, setLang, t }}>
      <div
        style={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 1000,
          display: "flex",
          gap: 4,
          background: "#fff",
          border: "1px solid #ccc",
          borderRadius: 6,
          padding: 4,
        }}
      >
        <button
          onClick={() => setLang("cs")}
          style={{
            padding: "0.25rem 0.5rem",
            background: lang === "cs" ? "#111" : "transparent",
            color: lang === "cs" ? "#fff" : "#111",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          CS
        </button>
        <button
          onClick={() => setLang("en")}
          style={{
            padding: "0.25rem 0.5rem",
            background: lang === "en" ? "#111" : "transparent",
            color: lang === "en" ? "#fff" : "#111",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          EN
        </button>
      </div>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslations() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslations must be used within I18nProvider");
  return ctx;
}
