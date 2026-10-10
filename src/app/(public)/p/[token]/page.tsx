import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { hostAllowsPortal, publicHostFor, publicOrg, resolvePublicHost } from "@/lib/public-host";
import { prisma } from "@/lib/prisma";
import { loadScope } from "@/lib/portal-server";
import PortalApp from "./PortalApp";

// Parent portal (docs/registration-portal-spec.md G) -- public, outside the login
// gate (src/proxy.ts). Unknown token = the plain 404 page. The UI strings come
// from the translations table here (the app's /api/translations needs a login);
// Czech only for now.
// Shown on other organisations' domains: "Rodičovský portál · <its organization>", never the app's name.
const loadPortal = cache(loadScope);

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const [row, portal] = await Promise.all([
    prisma.translation.findUnique({ where: { key: "portal.pageTitle" }, select: { cs: true } }),
    loadPortal((await params).token),
  ]);
  const title = row?.cs ?? "Rodičovský portál";
  const org = portal ? await publicOrg(portal.organizationId) : null;
  return {
    title: { absolute: org ? `${title} · ${org.name}` : title },
    robots: { index: false, follow: false },
    // The token is in the URL: never send it on as a referrer.
    referrer: "no-referrer",
  };
}

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Public host: only a portal one. Admin host: old e-mail links move to the portal host when there is one.
  const portal = await loadPortal(token);
  if (!portal) notFound();
  const scope = await resolvePublicHost(await headers());
  if (!hostAllowsPortal(scope, portal.organizationId)) notFound();
  if (scope.kind === "admin") {
    const host = await publicHostFor("portal", null, portal.organizationId);
    if (host) permanentRedirect(`https://${host}/p/${token}`);
  }
  const [rows, org] = await Promise.all([
    prisma.translation.findMany({ where: { key: { startsWith: "portal." } }, select: { key: true, cs: true } }),
    publicOrg(portal.organizationId),
  ]);
  return <PortalApp token={token} org={org} strings={Object.fromEntries(rows.map((r) => [r.key, r.cs]))} />;
}
