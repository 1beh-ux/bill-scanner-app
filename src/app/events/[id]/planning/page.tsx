"use client";

import { use } from "react";
import { useTranslations } from "@/lib/i18n";

// Planning Helper board -- see docs/planning-helper-module-design.md.
// ponytail: placeholder until the board (build step 4) lands.
export default function PlanningPage({ params }: { params: Promise<{ id: string }> }) {
  use(params);
  const { t } = useTranslations();

  return (
    <div className="mx-auto max-w-[1400px] p-4 md:p-8">
      <h1 className="text-[22px] font-semibold text-ink">{t("nav.planning")}</h1>
    </div>
  );
}
