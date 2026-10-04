import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { loadScope } from "@/lib/portal-server";
import PortalApp from "./PortalApp";

// Parent portal (docs/registration-portal-spec.md G) -- public, outside the login
// gate (src/proxy.ts). Unknown token = the plain 404 page. The UI strings come
// from the translations table here (the app's /api/translations needs a login);
// Czech only for now.
export const metadata: Metadata = {
  title: "Portál rodičů",
  robots: { index: false, follow: false },
  // The token is in the URL: never send it on as a referrer.
  referrer: "no-referrer",
};

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await loadScope(token))) notFound();
  const rows = await prisma.translation.findMany({ where: { key: { startsWith: "portal." } }, select: { key: true, cs: true } });
  return <PortalApp token={token} strings={Object.fromEntries(rows.map((r) => [r.key, r.cs]))} />;
}
