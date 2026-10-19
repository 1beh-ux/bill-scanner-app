import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { ticketsPdfOf } from "@/lib/tickets-server";

// The order's tickets PDF (what the buyer gets), e.g. to hand over in person.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; orderId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId, orderId } = await params;
  const denied = await requireModuleAccess(user, eventId, "tickets");
  if (denied) return denied;
  const order = await prisma.ticketOrder.findFirst({ where: { id: orderId, eventId }, select: { number: true } });
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const pdf = await ticketsPdfOf(orderId);
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="vstupenky-${order.number}.pdf"`, "Cache-Control": "no-store" },
  });
}
