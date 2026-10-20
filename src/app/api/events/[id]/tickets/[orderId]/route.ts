import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { isOrgAdmin } from "@/lib/org-scope";
import { TICKET_ORDER_PURPOSE_KEY, TICKET_SEND_PURPOSE_KEY } from "@/lib/email-template-purpose-keys";
import { cancelTicketOrder, markTicketOrderPaid, sendOrderMail } from "@/lib/tickets-server";

// One order: "pay" (paid by hand -> the tickets e-mail), "cancel" (+ e-mail), "resend" (the tickets
// again, paid orders) or "resend_order" (the payment e-mail again, pending orders).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; orderId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId, orderId } = await params;
  const denied = await requireModuleAccess(user, eventId, "tickets");
  if (denied) return denied;
  const order = await prisma.ticketOrder.findFirst({ where: { id: orderId, eventId }, include: { event: { select: { status: true } } } });
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (order.event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });

  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  let ok = false;
  if (action === "pay") ok = await markTicketOrderPaid(orderId, { via: "manual", userId: user.id });
  else if (action === "cancel") ok = await cancelTicketOrder(orderId, user.id);
  else if (action === "resend" && order.status === "paid") ok = await sendOrderMail(orderId, TICKET_SEND_PURPOSE_KEY);
  else if (action === "resend_order" && order.status === "pending") ok = await sendOrderMail(orderId, TICKET_ORDER_PURPOSE_KEY);
  else return NextResponse.json({ error: "bad_action" }, { status: 400 });

  const now = await prisma.ticketOrder.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, sendError: true } });
  return NextResponse.json({ ok, ...now });
}

// A cancelled order deleted for good (test orders, clean-up): organization admins. Its tickets go with
// it; a bank payment paired to it is unpaired. Numbering is "highest + 1", so the newest numbers come back.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; orderId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId, orderId } = await params;
  const denied = await requireModuleAccess(user, eventId, "tickets");
  if (denied) return denied;
  if (!isOrgAdmin(user)) return NextResponse.json({ error: "admin_only" }, { status: 403 });
  const order = await prisma.ticketOrder.findFirst({ where: { id: orderId, eventId }, include: { event: { select: { status: true } } } });
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (order.event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  if (order.status !== "cancelled") return NextResponse.json({ error: "not_cancelled" }, { status: 409 });
  await prisma.ticketOrder.delete({ where: { id: orderId } });
  return NextResponse.json({ ok: true });
}
