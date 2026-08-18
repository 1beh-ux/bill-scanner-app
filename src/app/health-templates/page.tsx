"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n";
import ListTemplateAdmin from "@/components/health/ListTemplateAdmin";

export default function HealthTemplatesPage() {
  const { t } = useTranslations();
  const [tab, setTab] = useState<"med" | "situation">("med");

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <h1 className="mb-1 text-[22px] font-semibold text-ink">{t("healthTemplatesPage.title")}</h1>
      <p className="mb-4 text-[14px] text-ink-secondary">{t("healthTemplatesPage.subtitle")}</p>

      <div className="mb-4 flex gap-1 border-b border-mist">
        <button
          onClick={() => setTab("med")}
          className={
            "border-b-2 px-3 py-2 text-[13px] font-medium " +
            (tab === "med" ? "border-ember text-ink" : "border-transparent text-ink-secondary hover:text-ink")
          }
        >
          {t("healthTemplatesPage.tabMeds")}
        </button>
        <button
          onClick={() => setTab("situation")}
          className={
            "border-b-2 px-3 py-2 text-[13px] font-medium " +
            (tab === "situation" ? "border-ember text-ink" : "border-transparent text-ink-secondary hover:text-ink")
          }
        >
          {t("healthTemplatesPage.tabSituations")}
        </button>
      </div>

      {tab === "med" && <ListTemplateAdmin kind="med" scope="org" label={t("healthTemplatesPage.tabMeds")} />}
      {tab === "situation" && (
        <ListTemplateAdmin kind="situation" scope="org" label={t("healthTemplatesPage.tabSituations")} />
      )}
    </div>
  );
}
