import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: eventId } = await params;
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

  const result = await prisma.bill.updateMany({
    where: {
      eventId,
      payerAuthorId: authorId,
      ...(scope === "approved" ? { status: "approved" } : {}),
      paidToAuthor: action === "pay" ? false : true,
    },
    data:
      action === "pay"
        ? { paidToAuthor: true, paidAt: new Date(), paidByUserId: user.id }
        : { paidToAuthor: false, paidAt: null, paidByUserId: null },
  });

  return NextResponse.json({ updated: result.count });
}