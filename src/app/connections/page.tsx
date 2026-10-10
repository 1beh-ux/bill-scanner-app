"use client";

import { useTranslations } from "@/lib/i18n";
import PublicHostsAdmin from "@/components/PublicHostsAdmin";

// Organizace -> Připojení (admin): the organization's own public addresses, read-only.
// Adding/editing them is Aplikace -> Veřejné adresy (super-admin).
export default function ConnectionsPage() {
  const { t } = useTranslations();
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <h1 className="mb-1 text-[22px] font-semibold text-ink">{t("connections.title")}</h1>
      <p className="mb-6 text-[14px] text-ink-secondary">{t("connections.subtitle")}</p>
      <PublicHostsAdmin app={false} />
    </div>
  );
}
