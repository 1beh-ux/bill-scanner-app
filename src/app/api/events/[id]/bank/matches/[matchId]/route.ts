import { NextRequest, NextResponse } from "next/server";
import { requireBank } from "@/lib/bank/guard";
import { unpair } from "@/lib/bank/pairing";

// Unpair (chip ✕): ?clearPaid=1 also takes back the Proplaceno this pairing set.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; matchId: string }> }) {
  const { id, matchId } = await params;
  const ctx = await requireBank(id);
  if ("error" in ctx) return ctx.error;
  if (ctx.event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  const r = await unpair({ eventId: id, matchId, userId: ctx.user.id, clearPaid: req.nextUrl.searchParams.get("clearPaid") === "1" });
  return NextResponse.json(r, { status: "error" in r ? 404 : 200 });
}
