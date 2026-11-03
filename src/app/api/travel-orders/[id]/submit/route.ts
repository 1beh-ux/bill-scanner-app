import { NextRequest, NextResponse } from "next/server";
import { requireOrderAccess, submitOrder } from "@/lib/travel-orders-server";

// Odeslat: freeze the (saved) draft and create its bill. Blocking problems -> 400 with the precise reason.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireOrderAccess((await params).id);
  if ("error" in a) return a.error;
  const r = await submitOrder(a.order, a.user);
  return NextResponse.json(r, { status: "ok" in r ? 200 : r.error === "event_closed_locked" || r.error === "not_draft" ? 409 : 400 });
}
