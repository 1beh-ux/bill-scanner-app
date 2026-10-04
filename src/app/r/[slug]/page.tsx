import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { publicEvent, publicFormContext } from "@/lib/public-registration-server";
import PublicForm from "./PublicForm";

// Public registration page (docs/registration-slice3-spec.md D) -- outside the
// login gate (src/proxy.ts). Landing info + the new-family form. A slug that
// isn't switched on (or the event is closed / past its deadline) = the plain
// 404 page. UI strings come from the translations table (public.* + portal.*),
// Czech only for now, like the portal.
export const metadata: Metadata = { title: "Přihláška", referrer: "no-referrer" };

export default async function PublicRegistrationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await publicEvent(slug);
  if (!event) notFound();
  const [ctx, rows] = await Promise.all([
    publicFormContext(event),
    prisma.translation.findMany({ where: { OR: [{ key: { startsWith: "public." } }, { key: { startsWith: "portal." } }] }, select: { key: true, cs: true } }),
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
      strings={Object.fromEntries(rows.map((r) => [r.key, r.cs]))}
    />
  );
}
