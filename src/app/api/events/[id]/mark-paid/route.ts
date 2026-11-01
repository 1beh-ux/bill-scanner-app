import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { markPersonPaid } from "@/lib/settlement-links";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const authorId: string | undefined = body.authorId;
  const action: "pay" | "unpay" = body.action === "unpay" ? "unpay" : "pay";
  if (!authorId) {
    return NextResponse.json({ error: "authorId is required" }, { status: 400 });
  }

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (event.status === "closed") {
    return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  }

  const scope: "approved" | "all" = body.scope === "all" ? "all" : "approved";
  // Official bills + the personal parts netted with them (src/lib/settlement-links.ts).
  const r = await markPersonPaid(eventId, authorId, user.id, action === "pay", scope);
  const result = { count: r.bills };
  const shares = { count: r.personal };

  return NextResponse.json({ updated: result.count, personal: shares.count });
}