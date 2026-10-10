import { NextRequest, NextResponse } from "next/server";
import { createPublicRegistration, publicEvent, publicFormContext } from "@/lib/public-registration-server";
import { isSpam, SUBMIT_LIMIT_PER_HOUR, validateSubmission } from "@/lib/public-registration";
import { hashedIp, takeRateSlot } from "@/lib/portal-rate";
import { autoAcceptRegistrations } from "@/lib/auto-accept";
import { portalUrl } from "@/lib/portal-gate";
import { hostAllowsRegistration, resolvePublicHost } from "@/lib/public-host";

// Public new-family registration (docs/registration-slice3-spec.md D) --
// outside the login gate (src/proxy.ts). Unknown/closed slug = bare 404.
// Spam: a honeypot field (answered "ok", nothing stored) + max
// SUBMIT_LIMIT_PER_HOUR valid submits per IP (max 10 people each). Nothing is
// e-mailed unless the event is set to auto-send (E).
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await publicEvent(slug);
  if (!event || !hostAllowsRegistration(await resolvePublicHost(req), event.id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (isSpam(body)) return NextResponse.json({ ok: true }, { status: 201 });
  const ctx = await publicFormContext(event);
  const result = validateSubmission(body, { ...ctx, today: new Date() });
  if (!result.ok) return NextResponse.json({ error: "invalid", fields: result.errors }, { status: 400 });
  // Counted per valid submit (a parent fixing typos isn't locked out); invalid ones store nothing.
  if (!(await takeRateSlot(`submit:${hashedIp(req)}`, SUBMIT_LIMIT_PER_HOUR, 3600 * 1000))) return NextResponse.json({ error: "throttled" }, { status: 429 });

  const { ids, portalToken } = await createPublicRegistration(event, result.data, ctx.fields);
  // Inline, not after(): Cloud Run's request-based CPU would throttle work after the response.
  await autoAcceptRegistrations(event.id, ids, "public");
  // accept_send events show the family's portal link on the confirmation screen (slice 4 #10).
  return NextResponse.json({ ok: true, portalLink: portalToken ? portalUrl(portalToken, req) : null }, { status: 201 });
}
