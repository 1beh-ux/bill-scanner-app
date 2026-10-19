import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { remaining } from "@/lib/tickets";
import { doorCounts, eventSaleSetup, soldCounts } from "@/lib/tickets-server";
import { eventSender } from "@/lib/auto-accept";

// Vstupenky -> Objednávky (docs/public-event-tickets-spec.md): every order with its tickets' state,
// sales per price type, the door counts, and the event account's payments the bank check couldn't
// settle that look like ticket payments (the order's VS / this event's VS prefix).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "tickets");
  if (denied) return denied;

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const { types, settings } = eventSaleSetup(event);
  const [orders, sold, door, paidTickets, sender] = await Promise.all([
    prisma.ticketOrder.findMany({
      where: { eventId },
      orderBy: { number: "desc" },
      include: { tickets: { select: { usedAt: true } } },
    }),
    soldCounts(eventId),
    doorCounts(eventId),
    prisma.ticket.groupBy({ by: ["priceKey"], where: { eventId, order: { status: "paid" } }, _count: true }),
    eventSender(event),
  ]);
  const left = remaining(types, settings, sold);
  const review = event.bankAccountId
    ? await prisma.bankMovement.findMany({
        where: {
          bankAccountId: event.bankAccountId,
          status: "review",
          OR: [{ ticketOrder: { eventId } }, { ticketOrderId: null, participantId: null, variableSymbol: { startsWith: settings.vsPrefix } }],
        },
        orderBy: { bookedAt: "desc" },
        take: 100,
        select: { id: true, bookedAt: true, amount: true, variableSymbol: true, counterName: true, message: true, reason: true, ticketOrderId: true },
      })
    : [];

  return NextResponse.json({
    eventName: event.name,
    hasSender: !!sender,
    bankCheck: event.bankCheckEnabled && !!event.bankAccountId,
    types: types.map((t) => ({ ...t, sold: sold[t.key] ?? 0, paid: paidTickets.find((p) => p.priceKey === t.key)?._count ?? 0, left: left.perType[t.key] })),
    totalCapacity: settings.totalCapacity,
    totalLeft: left.total,
    door,
    // publicToken is the buyer's own status link -- not shown here.
    orders: orders.map(({ tickets, ...o }) => ({ ...o, publicToken: undefined, ticketCount: tickets.length, usedCount: tickets.filter((t) => t.usedAt).length })),
    review: review.map((m) => ({ ...m, amount: Number(m.amount) })),
  });
}
