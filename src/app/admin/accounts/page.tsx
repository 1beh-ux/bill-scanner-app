"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n";

// Aplikace -> Účty (super-admin): every account across organizations; "Zobrazit jako" per organization.
type OrgRole = { id: string; shortName: string; active: boolean; role: "admin" | "accountant" | "user"; own: boolean };
type Account = { id: string; email: string; displayName: string; active: boolean; isSuperAdmin: boolean; self: boolean; organizations: OrgRole[] };

const ROLE_KEYS = { admin: "usersPage.roleAdmin", accountant: "usersPage.roleAccountant", user: "usersPage.roleUser" } as const;

export default function AccountsPage() {
  const { t, isSuperAdmin, roleLoaded, setCurrentEventId } = useTranslations();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch("/api/admin/accounts")
      .then((r) => (r.ok ? r.json() : null))
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, [isSuperAdmin]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (accounts ?? []).filter((a) => !needle || [a.email, a.displayName, ...a.organizations.map((o) => o.shortName)].some((s) => s.toLowerCase().includes(needle)));
  }, [accounts, q]);

  async function viewAs(a: Account, o: OrgRole) {
    setError(null);
    const res = await fetch("/api/impersonate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: a.id, organizationId: o.id }) });
    if (!res.ok) return setError(t("impersonate.failed"));
    setCurrentEventId(null);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload: every list and /api/me must refetch as the other user
    window.location.assign("/");
  }

  if (!roleLoaded || !isSuperAdmin) return null;
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <h1 className="mb-1 text-[22px] font-semibold text-ink">{t("accounts.title")}</h1>
      <p className="mb-4 text-[14px] text-ink-secondary">{t("accounts.subtitle")}</p>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("accounts.search")}
        className="mb-4 w-full max-w-sm rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember"
      />
      {error && <p className="mb-3 text-[13px] text-red-700">{error}</p>}
      {accounts === null ? (
        <p className="text-[14px] text-ink-secondary">{t("common.loading")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-mist text-left text-[12px] text-ink-secondary">
                <th className="p-2 font-medium">{t("common.name")}</th>
                <th className="p-2 font-medium">{t("usersPage.colEmail")}</th>
                <th className="p-2 font-medium">{t("accounts.colOrganizations")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id} className={"border-b border-mist/60 align-top " + (a.active ? "" : "opacity-60")}>
                  <td className="p-2 text-[14px] text-ink">
                    {a.displayName}
                    {a.isSuperAdmin && <span className="ml-2 rounded-full bg-ember/15 px-2 py-0.5 text-[11px] text-ember">{t("accounts.superAdmin")}</span>}
                    {!a.active && <span className="ml-2 text-[12px] text-ink-secondary">{t("authors.statusInactive")}</span>}
                  </td>
                  <td className="p-2 text-[14px] text-ink-secondary">{a.email}</td>
                  <td className="p-2">
                    <ul className="flex flex-col gap-1">
                      {a.organizations.map((o) => (
                        <li key={o.id} className="flex flex-wrap items-center gap-x-2 text-[13px]">
                          <span className={o.active ? "text-ink" : "text-ink-secondary line-through"}>{o.shortName}</span>
                          <span className="text-ink-secondary">· {t(ROLE_KEYS[o.role])}{o.own ? "" : ` · ${t("usersPage.memberBadge")}`}</span>
                          {a.active && !a.self && !a.isSuperAdmin && o.active && (
                            <button type="button" onClick={() => viewAs(a, o)} className="text-ember hover:underline" title={t("impersonate.hint")}>
                              {t("impersonate.button")}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
