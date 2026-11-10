"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { usePathname } from "next/navigation";
import { isPublicPath } from "@/lib/public-paths";

// Acting organization (organizations step 3): the sidebar switcher and the "Pracujete v
// organizaci" strip. Super-admin: every active organization; a member of several: theirs.

type OrgOption = { id: string; name: string; shortName: string; active: boolean };

/** Switch (null = back home), forget the remembered event (it belongs to the old organization), start over. */
export function useSwitchOrg() {
  const { setCurrentEventId } = useTranslations();
  return async (organizationId: string | null) => {
    const res = await fetch("/api/acting-org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!res.ok) return false;
    setCurrentEventId(null);
    // A full load on purpose (not router.push): every list, the event switcher and the
    // context (/api/me) must refetch in the new organization.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
    return true;
  };
}

export function OrgSwitcher() {
  const { t, isSuperAdmin, organization, memberOrganizations } = useTranslations();
  const switchOrg = useSwitchOrg();
  const [allOrgs, setOrgs] = useState<OrgOption[]>([]);
  const orgs = isSuperAdmin ? allOrgs : memberOrganizations;

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch("/api/organizations")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { organizations: OrgOption[] } | null) => setOrgs(data?.organizations.filter((o) => o.active) ?? []))
      .catch(() => {});
  }, [isSuperAdmin]);

  if (!organization || orgs.length < 2) return null;
  return (
    <>
      <div className="px-1 pb-1 text-[11px] uppercase tracking-wide text-night-muted">{t("orgs.switcherLabel")}</div>
      <select
        value={organization.id}
        onChange={(e) => switchOrg(e.target.value)}
        aria-label={t("orgs.switcherLabel")}
        className="mb-2 w-full rounded-lg border-0 bg-night-2 px-2.5 py-1.5 text-[13px] text-paper focus:outline-none focus:ring-1 focus:ring-ember"
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.shortName}
          </option>
        ))}
      </select>
    </>
  );
}

export function ActingOrgStrip() {
  const { t, organization, homeOrganization } = useTranslations();
  const switchOrg = useSwitchOrg();
  const pathname = usePathname();
  if (isPublicPath(pathname) || !organization || !homeOrganization || organization.id === homeOrganization.id) return null;
  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 bg-ember px-4 py-2 text-[13px] font-medium text-white print:hidden">
      <span>{t("orgs.actingStrip", { name: organization.name })}</span>
      <button type="button" onClick={() => switchOrg(null)} className="rounded-lg bg-white/15 px-3 py-1 hover:bg-white/25">
        {t("orgs.backHome", { name: homeOrganization.shortName })}
      </button>
    </div>
  );
}
