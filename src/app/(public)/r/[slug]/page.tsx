import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { hostAllowsRegistration, publicHostFor, publicOrg, resolvePublicHost } from "@/lib/public-host";
import { prisma } from "@/lib/prisma";
import { publicEvent, publicFormContext } from "@/lib/public-registration-server";
import PublicForm from "./PublicForm";

// Public registration page (docs/registration-slice3-spec.md D) -- outside the
// login gate (src/proxy.ts). Landing info + the new-family form. A slug that
// isn't switched on (or the event is closed / past its deadline) = the plain
// 404 page. UI strings come from the translations table (public.* + portal.*),
// Czech only for now, like the portal.
// Shown on other organisations' domains: "<event> · <its organization>", never the app's name.
const loadEvent = cache(publicEvent);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const event = await loadEvent((await params).slug);
  let title = event?.name ?? "Přihláška";
  if (event?.kind === "membership") {
    const row = await prisma.translation.findUnique({ where: { key: "portal.membership" }, select: { cs: true } });
    title = (row?.cs ?? "Členství {year}").replace("{year}", String(event.membershipYear ?? ""));
  }
  const org = event ? await publicOrg(event.organizationId) : null;
  return { title: { absolute: org ? `${title} · ${org.name}` : title }, referrer: "no-referrer" };
}

export default async function PublicRegistrationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await loadEvent(slug);
  if (!event) notFound();
  // Public host: only its purpose/event. Admin host: old links move to the public host when there is one.
  const scope = await resolvePublicHost(await headers());
  if (!hostAllowsRegistration(scope, event)) notFound();
  if (scope.kind === "admin") {
    const host = await publicHostFor("registration", event.id, event.organizationId);
    if (host) permanentRedirect(`https://${host}/r/${slug}`);
  }
  const [ctx, rows, org] = await Promise.all([
    publicFormContext(event),
    prisma.translation.findMany({ where: { OR: [{ key: { startsWith: "public." } }, { key: { startsWith: "portal." } }] }, select: { key: true, cs: true } }),
    publicOrg(event.organizationId),
  ]);
  return (
    <PublicForm
      slug={slug}
      event={{
        name: event.name,
        kind: event.kind,
        membershipYear: event.membershipYear,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString(),
        registrationDeadline: event.registrationDeadline?.toISOString() ?? null,
        landingContent: event.landingContent,
        memberPriceCzk: event.memberPriceCzk,
        nonMemberPriceCzk: event.nonMemberPriceCzk,
      }}
      fields={ctx.fields}
      rules={ctx.rules}
      oddil={ctx.oddil}
      org={org}
      strings={Object.fromEntries(rows.map((r) => [r.key, r.cs]))}
    />
  );
}
