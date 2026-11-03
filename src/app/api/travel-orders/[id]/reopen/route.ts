import { NextRequest, NextResponse } from "next/server";
import { reopenOrder, requireOrderAccess } from "@/lib/travel-orders-server";

// Znovu otevřít (audited on the bill): the submitted order is a draft again; its rate values stay frozen.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireOrderAccess((await params).id);
  if ("error" in a) return a.error;
  const r = await reopenOrder(a.order, a.user);
  return NextResponse.json(r, { status: "ok" in r ? 200 : 409 });
}
