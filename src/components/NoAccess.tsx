"use client";

import Link from "next/link";
import { useTranslations } from "@/lib/i18n";

// N2 (audit2): the one denial for every module page a user has no grant for (direct URL included).
export default function NoAccess() {
  const { t } = useTranslations();
  return (
    <div className="mx-auto max-w-xl p-8 text-[14px] text-ink-secondary">
      <p className="mb-1 text-[16px] font-semibold text-ink">{t("noAccess.title")}</p>
      <p className="mb-3">{t("noAccess.hint")}</p>
      <Link href="/events" className="text-ember hover:underline">
        ← {t("noAccess.back")}
      </Link>
    </div>
  );
}
