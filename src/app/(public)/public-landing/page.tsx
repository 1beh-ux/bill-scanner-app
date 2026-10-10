import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { publicOrg, resolvePublicHost } from "@/lib/public-host";
import { OrgFooter } from "@/components/registration/OrgBrand";

// "/" on a public host (src/proxy.ts rewrites it here): whose host it is, nothing
// else. An unknown host -- or one of a deactivated organization -- is a 404
// (organizations step 5). "Ověřit" in Organizace -> Připojení looks for data-public-landing.
export const dynamic = "force-dynamic";

const strings = async () =>
  Object.fromEntries(
    (await prisma.translation.findMany({ where: { OR: [{ key: { startsWith: "publicLanding." } }, { key: "portal.contact" }] }, select: { key: true, cs: true } })).map((r) => [r.key, r.cs])
  );

async function hostOrg() {
  const scope = await resolvePublicHost(await headers());
  return scope.kind === "public" ? publicOrg(scope.organizationId) : null;
}

export async function generateMetadata(): Promise<Metadata> {
  const [s, org] = await Promise.all([strings(), hostOrg()]);
  const title = s["publicLanding.title"] ?? "Přihlášky a rodičovský portál";
  return { title: { absolute: org ? `${title} · ${org.name}` : title }, robots: { index: false, follow: false } };
}

export default async function PublicLandingPage() {
  const [s, org] = await Promise.all([strings(), hostOrg()]);
  if (!org) notFound();
  return (
    <main data-public-landing className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="max-w-md text-center">
        <p className="mb-1 text-[14px] font-semibold text-ink">{org.name}</p>
        <h1 className="mb-2 text-[20px] font-semibold text-ink">{s["publicLanding.title"] ?? "Přihlášky a rodičovský portál"}</h1>
        <p className="text-[14px] text-ink-secondary">{s["publicLanding.text"] ?? ""}</p>
        <OrgFooter org={org} label={s["portal.contact"] ?? "Kontakt:"} />
      </div>
    </main>
  );
}
