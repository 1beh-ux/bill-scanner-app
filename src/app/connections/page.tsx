"use client";

import { useTranslations } from "@/lib/i18n";
import PublicHostsAdmin from "@/components/PublicHostsAdmin";
import BankAccountsAdmin from "@/components/bank/BankAccountsAdmin";

// Organizace -> Připojení (admin): the organization's own public addresses, read-only.
// Adding/editing them is Aplikace -> Veřejné adresy (super-admin). Below: Banka (Fio accounts).
export default function ConnectionsPage() {
  const { t } = useTranslations();
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <h1 className="mb-1 text-[22px] font-semibold text-ink">{t("connections.title")}</h1>
      <p className="mb-6 text-[14px] text-ink-secondary">{t("connections.subtitle")}</p>
      {/* Two separate things (audit 2026-11-05): where the public pages run, and the bank accounts + tokens. */}
      <div className="mb-6 rounded-xl border border-mist p-4">
        <PublicHostsAdmin app={false} />
      </div>
      <div id="banka" className="scroll-mt-20 rounded-xl border border-mist p-4 [&>section]:mt-0">
        <BankAccountsAdmin />
      </div>
    </div>
  );
}
