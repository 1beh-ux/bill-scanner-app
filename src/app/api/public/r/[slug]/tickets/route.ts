import { NextRequest, NextResponse } from "next/server";
import { publicEvent } from "@/lib/public-registration-server";
import { isSpam } from "@/lib/public-registration";
import { hashedIp, takeRateSlot } from "@/lib/portal-rate";
import { hostAllowsRegistration, resolvePublicHost } from "@/lib/public-host";
import { ORDER_LIMIT_PER_HOUR } from "@/lib/tickets";
import { createTicketOrder, isOnSale } from "@/lib/tickets-server";
import { orderConfirmation } from "@/lib/tickets-order-response";

// Ticket order from the public page /r/<slug> of a public event (docs/public-event-tickets-spec.md) --
// outside the login gate. Same spam rules as the registration form: a honeypot + ORDER_LIMIT_PER_HOUR
// valid orders per IP.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await publicEvent(slug);
  if (!event || !isOnSale(event) || !hostAllowsRegistration(await resolvePublicHost(req), event)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (isSpam(body)) return NextResponse.json({ ok: true }, { status: 201 });
  if (!(await takeRateSlot(`tickets:${hashedIp(req)}`, ORDER_LIMIT_PER_HOUR, 3600 * 1000))) return NextResponse.json({ error: "throttled" }, { status: 429 });
  const result = await createTicketOrder(event, body, "public");
  if (!result.ok) return NextResponse.json({ error: "invalid", fields: result.errors }, { status: 400 });
  return NextResponse.json(await orderConfirmation(event, result.order), { status: 201 });
}
