import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { portalScope } from "@/lib/portal-server";
import { takeRateSlot } from "@/lib/portal-rate";
import { ORDER_LIMIT_PER_HOUR } from "@/lib/tickets";
import { createTicketOrder, isOnSale } from "@/lib/tickets-server";
import { orderConfirmation } from "@/lib/tickets-order-response";

// Ticket order from the parent portal (docs/public-event-tickets-spec.md): adults of the link only,
// the form prefilled -- but the order is NOT tied to the person (a buyer like on the public page).
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { scope, error } = await portalScope(token, true);
  if (error) return error;
  if (!scope.members.some((m) => m.isAdult && !m.leftAt)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { eventId?: unknown } | null;
  const event = typeof body?.eventId === "string" ? await prisma.event.findFirst({ where: { id: body.eventId, organizationId: scope.organizationId, portalOpen: true } }) : null;
  if (!event || !isOnSale(event)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await takeRateSlot(`tickets:p:${scope.id}`, ORDER_LIMIT_PER_HOUR, 3600 * 1000))) return NextResponse.json({ error: "throttled" }, { status: 429 });
  const result = await createTicketOrder(event, body, "portal");
  if (!result.ok) return NextResponse.json({ error: "invalid", fields: result.errors }, { status: 400 });
  return NextResponse.json(await orderConfirmation(event, result.order), { status: 201 });
}
