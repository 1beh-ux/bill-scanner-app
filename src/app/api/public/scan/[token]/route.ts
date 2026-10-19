import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { takeRateSlot } from "@/lib/portal-rate";
import { normalizeTicketCode } from "@/lib/tickets";
import { doorCounts, scanTicket } from "@/lib/tickets-server";

// The secret door link /vstup/<token> (docs/public-event-tickets-spec.md): check-in without a login.
// The token is Event.ticketScanToken (a new one / "revoke" in the Vstupenky settings kills the old).
// It only answers scans of its own event's tickets.
async function eventOf(token: string) {
  if (token.length < 20) return null;
  return prisma.event.findUnique({ where: { ticketScanToken: token }, select: { id: true, name: true, status: true } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const event = await eventOf((await params).token);
  if (!event || event.status !== "active") return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ eventName: event.name, counts: await doorCounts(event.id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const event = await eventOf(token);
  if (!event || event.status !== "active") return NextResponse.json({ error: "not_found" }, { status: 404 });
  // Guessing codes through a leaked link: 600 scans per 10 min is plenty for one door.
  if (!(await takeRateSlot(`scan:${event.id}`, 600, 10 * 60 * 1000))) return NextResponse.json({ error: "throttled" }, { status: 429 });
  const { code } = (await req.json().catch(() => ({}))) as { code?: unknown };
  return NextResponse.json({ result: await scanTicket(event.id, normalizeTicketCode(code), "link"), counts: await doorCounts(event.id) });
}
