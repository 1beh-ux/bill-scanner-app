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
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (event.status === "closed") {
    return NextResponse.json({ error: "event_already_closed" }, { status: 400 });
  }

  const updated = await prisma.event.update({
    where: { id },
    data: { status: "closed", closedAt: new Date() },
  });
  return NextResponse.json(updated);
}