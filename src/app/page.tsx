"use client";

import { useTranslations } from "@/lib/i18n";

export default function Home() {
  const { t } = useTranslations();

  return (
    <div style={{ padding: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1rem" }}>Bill Scanner V2</h1>
      <nav style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <a href="/events" style={{ color: "#111", textDecoration: "underline" }}>
          {t("nav.events")}
        </a>
        <a href="/category-templates" style={{ color: "#111", textDecoration: "underline" }}>
          {t("nav.categoryTemplates")}
        </a>
        <a href="/authors" style={{ color: "#111", textDecoration: "underline" }}>
          {t("nav.authors")}
        </a>
      </nav>
    </div>
  );
}
