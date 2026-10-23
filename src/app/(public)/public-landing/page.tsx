import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { publicOrg, resolvePublicHost } from "@/lib/public-host";
import { OrgFooter } from "@/components/registration/OrgBrand";
import PublicFrame from "@/components/embed/PublicFrame";
import { pageAppearance } from "@/lib/public-appearance";
import { embedParams } from "@/components/embed/embed-params";
import PortalHelp from "@/components/registration/PortalHelp";
import { portalJoinHref } from "@/lib/portal-join";

// "/" on a public host (src/proxy.ts rewrites it here): whose host it is, nothing
// else. An unknown host -- or one of a deactivated organization -- is a 404
// (organizations step 5). "Ověřit" in Organizace -> Připojení looks for data-public-landing.
export const dynamic = "force-dynamic";

const strings = async () =>
  Object.fromEntries(
    (await prisma.translation.findMany({ where: { OR: [{ key: { startsWith: "publicLanding." } }, { key: { startsWith: "portal." } }] }, select: { key: true, cs: true } })).map((r) => [r.key, r.cs])
  );

async function hostOrg() {
  const scope = await resolvePublicHost(await headers());
  return scope.kind === "public" ? publicOrg(scope.organizationId) : null;
}

// "Zapomněl(a) jsem odkaz" / "Ještě nejsem členem" (only a yes/no and a link reach the page).
async function hostHelp() {
  const scope = await resolvePublicHost(await headers());
  if (scope.kind !== "public") return null;
  const o = await prisma.organization.findUniqueOrThrow({ where: { id: scope.organizationId }, select: { id: true, portalRecoverySenderEmail: true, portalJoinUrl: true, portalJoinEventId: true } });
  return { recovery: !!o.portalRecoverySenderEmail, joinHref: await portalJoinHref(o) };
}

export async function generateMetadata(): Promise<Metadata> {
  const [s, org] = await Promise.all([strings(), hostOrg()]);
  const title = s["publicLanding.title"] ?? "Přihlášky a rodičovský portál";
  return { title: { absolute: org ? `${title} · ${org.name}` : title }, robots: { index: false, follow: false } };
}

export default async function PublicLandingPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const [s, org, help] = await Promise.all([strings(), hostOrg(), hostHelp()]);
  if (!org) notFound();
  const { embed, theme } = embedParams((await searchParams) ?? {});
  // Embedded (the portal snippet without a token in the address): say how to get in.
  return (
    <PublicFrame embed={embed} theme={theme} appearance={pageAppearance(org, "portal", embed)}>
      <main data-public-landing className={"flex items-center justify-center p-6 " + (embed ? "" : "min-h-screen bg-paper")}>
        <div className="max-w-md text-center">
          <p className="mb-1 text-[14px] font-semibold text-ink">{org.name}</p>
          <h1 className="mb-2 text-[20px] font-semibold text-ink">{s["publicLanding.title"] ?? "Přihlášky a rodičovský portál"}</h1>
          <p className="text-[14px] text-ink-secondary">{embed ? (s["publicLanding.embedText"] ?? "") : (s["publicLanding.text"] ?? "")}</p>
          {help && <PortalHelp recovery={help.recovery} joinHref={help.joinHref} strings={s} />}
          <OrgFooter org={org} label={s["portal.contact"] ?? "Kontakt:"} />
        </div>
      </main>
    </PublicFrame>
  );
}
