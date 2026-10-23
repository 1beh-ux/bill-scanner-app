import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { hostAllowsRegistration, publicHostFor, publicOrg, resolvePublicHost } from "@/lib/public-host";
import { prisma } from "@/lib/prisma";
import { publicEvent, publicFormContext } from "@/lib/public-registration-server";
import PublicFrame from "@/components/embed/PublicFrame";
import { embedParams } from "@/components/embed/embed-params";
import { pageAppearance } from "@/lib/public-appearance";
import PublicForm from "./PublicForm";
import TicketPage from "./TicketPage";
import { remaining } from "@/lib/tickets";
import { eventSaleSetup, soldCounts } from "@/lib/tickets-server";
import { withPublicTexts } from "@/lib/public-texts";

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

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function PublicRegistrationPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams?: SP }) {
  const { slug } = await params;
  const { embed, theme } = embedParams((await searchParams) ?? {});
  const event = await loadEvent(slug);
  if (!event) notFound();
  // Public host: only its purpose/event. Admin host: old links move to the public host when there is one.
  const scope = await resolvePublicHost(await headers());
  if (!hostAllowsRegistration(scope, event)) notFound();
  if (scope.kind === "admin") {
    const host = await publicHostFor("registration", event.id, event.organizationId);
    // Keep ?embed / ?theme, or an embedded form lands as the full page.
    const q = new URLSearchParams({ ...(embed && { embed: "1" }), ...(theme && { theme }) }).toString();
    if (host) permanentRedirect(`https://${host}/r/${slug}${q ? `?${q}` : ""}`);
  }
  // Veřejná akce: the ticket form instead of the family registration (docs/public-event-tickets-spec.md).
  if (event.kind === "public_event") {
    const { types, settings } = eventSaleSetup(event);
    const [rows, org, sold] = await Promise.all([
      prisma.translation.findMany({ where: { OR: [{ key: { startsWith: "ticketForm." } }, { key: { startsWith: "portal." } }] }, select: { key: true, cs: true } }),
      publicOrg(event.organizationId),
      soldCounts(event.id),
    ]);
    const left = remaining(types, settings, sold);
    return (
      <PublicFrame embed={embed} theme={theme} appearance={pageAppearance(org, "registration", embed, event.appearance)}>
        <TicketPage
          slug={slug}
          event={{ name: event.name, startDate: event.startDate.toISOString(), endDate: event.endDate.toISOString(), location: event.location, landingContent: event.landingContent, hideHeader: event.publicHideHeader, registrationDeadline: event.registrationDeadline?.toISOString() ?? null }}
          types={types.map((ty) => ({ key: ty.key, label: ty.label, priceCzk: ty.priceCzk, left: left.perType[ty.key] }))}
          maxPerOrder={settings.maxPerOrder}
          texts={settings.texts}
          showLeft={settings.showLeft}
          org={{ ...org, contactEmail: event.publicContactEmail ?? org.contactEmail }}
          embed={embed}
          strings={withPublicTexts(Object.fromEntries(rows.map((r) => [r.key, r.cs])), org.publicTexts, event.publicTexts)}
        />
      </PublicFrame>
    );
  }
  const [ctx, rows, org] = await Promise.all([
    publicFormContext(event),
    prisma.translation.findMany({ where: { OR: [{ key: { startsWith: "public." } }, { key: { startsWith: "portal." } }] }, select: { key: true, cs: true } }),
    publicOrg(event.organizationId),
  ]);
  return (
    <PublicFrame embed={embed} theme={theme} appearance={pageAppearance(org, "registration", embed, event.appearance)}>
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
        hideHeader: event.publicHideHeader,
        memberPriceCzk: event.memberPriceCzk,
        nonMemberPriceCzk: event.nonMemberPriceCzk,
      }}
      fields={ctx.fields}
      rules={ctx.rules}
      oddil={ctx.oddil}
      org={{ ...org, contactEmail: event.publicContactEmail ?? org.contactEmail }}
      strings={withPublicTexts(Object.fromEntries(rows.map((r) => [r.key, r.cs])), org.publicTexts, event.publicTexts)}
    />
    </PublicFrame>
  );
}
