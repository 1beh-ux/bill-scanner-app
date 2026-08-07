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
  const { id } = await params;

  const bill = await prisma.bill.findUnique({
    where: { id },
    include: { event: { select: { status: true } } },
  });
  if (!bill) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (bill.event.status === "closed") {
    return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  }
if (!bill.payerAuthorId) {
    return NextResponse.json({ error: "no_payer" }, { status: 400 });
  }

  const updated = await prisma.bill.update({
    where: { id },
    data: { paidToAuthor: true, paidAt: new Date(), paidByUserId: user.id },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  const bill = await prisma.bill.findUnique({
    where: { id },
    include: { event: { select: { status: true } } },
  });
  if (!bill) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (bill.event.status === "closed") {
    return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  }

  const updated = await prisma.bill.update({
    where: { id },
    data: { paidToAuthor: false, paidAt: null, paidByUserId: null },
  });
  return NextResponse.json(updated);
}