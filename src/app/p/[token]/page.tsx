import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { hostAllowsPortal, publicHostFor, resolvePublicHost } from "@/lib/public-host";
import { prisma } from "@/lib/prisma";
import { loadScope } from "@/lib/portal-server";
import PortalApp from "./PortalApp";

// Parent portal (docs/registration-portal-spec.md G) -- public, outside the login
// gate (src/proxy.ts). Unknown token = the plain 404 page. The UI strings come
// from the translations table here (the app's /api/translations needs a login);
// Czech only for now.
// Shown on other organisations' domains: never the app's name in the title.
export async function generateMetadata(): Promise<Metadata> {
  const row = await prisma.translation.findUnique({ where: { key: "portal.pageTitle" }, select: { cs: true } });
  return {
    title: { absolute: row?.cs ?? "Rodičovský portál" },
    robots: { index: false, follow: false },
    // The token is in the URL: never send it on as a referrer.
    referrer: "no-referrer",
  };
}

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Public host: only a portal one. Admin host: old e-mail links move to the portal host when there is one.
  const scope = await resolvePublicHost(await headers());
  if (!hostAllowsPortal(scope)) notFound();
  if (scope.kind === "admin") {
    const host = await publicHostFor("portal", null);
    if (host) permanentRedirect(`https://${host}/p/${token}`);
  }
  if (!(await loadScope(token))) notFound();
  const rows = await prisma.translation.findMany({ where: { key: { startsWith: "portal." } }, select: { key: true, cs: true } });
  return <PortalApp token={token} strings={Object.fromEntries(rows.map((r) => [r.key, r.cs]))} />;
}
