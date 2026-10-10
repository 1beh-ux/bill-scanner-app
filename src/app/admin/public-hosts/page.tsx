"use client";

import { useTranslations } from "@/lib/i18n";
import PublicHostsAdmin from "@/components/PublicHostsAdmin";

// Aplikace -> Veřejné adresy (super-admin): every organization's public addresses.
export default function AppPublicHostsPage() {
  const { t, isSuperAdmin, roleLoaded } = useTranslations();
  if (roleLoaded && !isSuperAdmin) return <div className="p-8 text-[14px] text-ink-secondary">{t("orgs.superAdminOnly")}</div>;
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <h1 className="mb-1 text-[22px] font-semibold text-ink">{t("connections.hostsTitle")}</h1>
      <p className="mb-6 text-[14px] text-ink-secondary">{t("connections.appSubtitle")}</p>
      <PublicHostsAdmin app />
    </div>
  );
}
