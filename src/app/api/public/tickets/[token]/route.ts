import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { takeRateSlot } from "@/lib/portal-rate";
import { checkBankAccount } from "@/lib/bank/check";

// "Zkontrolovat platbu" after a ticket order: checks the event's Fio account (throttled to one
// call per 35 s per account by checkBankAccount) and answers only whether THIS order is paid.
// The token is the order's random publicToken, given only to whoever placed the order.
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token.length < 20) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const order = await prisma.ticketOrder.findUnique({ where: { publicToken: token }, select: { id: true, status: true, event: { select: { bankCheckEnabled: true, bankAccountId: true } } } });
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (order.status === "pending" && order.event.bankCheckEnabled && order.event.bankAccountId && (await takeRateSlot(`ticketpay:${order.id}`, 40, 10 * 60 * 1000))) {
    await checkBankAccount(order.event.bankAccountId, { reason: "portal" });
  }
  const now = await prisma.ticketOrder.findUniqueOrThrow({ where: { id: order.id }, select: { status: true } });
  return NextResponse.json({ paid: now.status === "paid", cancelled: now.status === "cancelled" }, { headers: { "Cache-Control": "no-store" } });
}
