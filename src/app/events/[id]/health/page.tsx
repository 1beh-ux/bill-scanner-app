"use client";

import { use } from "react";
import { useTranslations } from "@/lib/i18n";

export default function EventHealthPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useTranslations();

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <a href={`/events/${id}`} className="text-[13px] text-ink-secondary hover:text-ink">
        ← {t("billsPage.back")}
      </a>

      <h1 className="mb-2 mt-2 text-[22px] font-semibold text-ink">{t("healthPage.comingSoonTitle")}</h1>
      <p className="text-[14px] text-ink-secondary">{t("healthPage.comingSoonBody")}</p>
    </div>
  );
}
