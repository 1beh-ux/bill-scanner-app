import { NextRequest, NextResponse } from "next/server";
import { personalGuard } from "@/lib/personal-bills-server";
import { settlePair } from "@/lib/settlement-links";

// Person to person (bills whose author isn't the treasurer): POST { debtorId, creditorId, action: settle | unsettle }
// marks every open share between the two -- both directions, as Platby nets them -- settled (or open again).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await personalGuard(id);
  if ("error" in g) return g.error;
  if (g.event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  const b = (await req.json().catch(() => ({}))) as { debtorId?: unknown; creditorId?: unknown; action?: unknown };
  if (typeof b.debtorId !== "string" || typeof b.creditorId !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = { count: await settlePair(id, b.debtorId, b.creditorId, g.user.id, b.action !== "unsettle") };
  return NextResponse.json({ updated: r.count });
}
