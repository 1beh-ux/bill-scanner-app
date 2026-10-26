import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicEvent, publicFormContext } from "@/lib/public-registration-server";
import { hostAllowsRegistration, resolvePublicHost } from "@/lib/public-host";
import { adultAt } from "@/lib/children";
import { birthDatePasses, GATE_FAILURES_PER_HOUR } from "@/lib/participant-link";

// "Nabídnout členství" (2026-10-27): /r/<slug>?nabidka=<token> -- { token, birthDate } -> the person's details
// from that registration (not in Členové yet) to pre-fill the form. Behind the birth date, counted like the
// participant page's gate (10 wrong an hour block it). Nothing is created here.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const event = await publicEvent((await params).slug);
  if (!event || event.kind === "public_event" || !hostAllowsRegistration(await resolvePublicHost(req), event)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" && body.token.length <= 64 ? body.token : "";
  const p = token ? await prisma.participant.findUnique({ where: { detailsToken: token }, include: { guardians: true, event: { select: { organizationId: true, startDate: true } } } }) : null;
  if (!p || p.childId || p.event.organizationId !== event.organizationId) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const key = `ugate:${p.id}`;
  const failures = await prisma.portalRateHit.count({ where: { key, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (failures >= GATE_FAILURES_PER_HOUR) return NextResponse.json({ error: "throttled" }, { status: 429 });
  if (!birthDatePasses(p, body.birthDate)) {
    await prisma.portalRateHit.create({ data: { key } });
    return NextResponse.json({ error: "wrong" }, { status: 403 });
  }
  const { fields } = await publicFormContext(event);
  const values = (p.customFieldValues as Record<string, string> | null) ?? {};
  return NextResponse.json({
    person: {
      firstName: p.firstName ?? p.name.split(" ")[0] ?? "",
      lastName: p.lastName ?? p.name.split(" ").slice(1).join(" "),
      birthDate: p.dateOfBirth?.toISOString().slice(0, 10) ?? "",
      isAdult: p.isAdult ?? adultAt(p.dateOfBirth, p.event.startDate),
      values: Object.fromEntries(fields.filter((f) => values[f.key]).map((f) => [f.key, values[f.key]])),
    },
    guardians: p.guardians.map((g) => ({ name: g.name ?? "", email: g.email, phone: g.phone ?? "", relationship: g.relationship ?? "" })),
  });
}
