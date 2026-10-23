import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hostAllowsPortal, publicOrg, resolvePublicHost } from "@/lib/public-host";
import PublicFrame from "@/components/embed/PublicFrame";
import { pageAppearance } from "@/lib/public-appearance";
import { embedParams } from "@/components/embed/embed-params";
import { withPublicTexts } from "@/lib/public-texts";
import ParticipantApp from "./ParticipantApp";

// A participant's own page (src/lib/participant-link.ts): outside the login gate (src/proxy.ts), on the
// organization's portal host. The token is the address; the data comes after the birth date (its API).
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function ParticipantPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams?: SP }) {
  const { token } = await params;
  const { embed, theme } = embedParams((await searchParams) ?? {});
  const p = token.length <= 64 ? await prisma.participant.findUnique({ where: { detailsToken: token }, select: { event: { select: { organizationId: true, status: true } } } }) : null;
  if (!p || p.event.status !== "active") notFound();
  if (!hostAllowsPortal(await resolvePublicHost(await headers()), p.event.organizationId)) notFound();
  const [rows, org] = await Promise.all([
    prisma.translation.findMany({ where: { OR: [{ key: { startsWith: "portal." } }, { key: { startsWith: "participantPage." } }] }, select: { key: true, cs: true } }),
    publicOrg(p.event.organizationId),
  ]);
  return (
    <PublicFrame embed={embed} theme={theme} appearance={pageAppearance(org, "portal", embed)}>
      <ParticipantApp token={token} org={org} strings={withPublicTexts(Object.fromEntries(rows.map((r) => [r.key, r.cs])), org.publicTexts)} />
    </PublicFrame>
  );
}
