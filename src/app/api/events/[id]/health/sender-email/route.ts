import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { senderEmail: true } });
  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ senderEmail: event.senderEmail });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;

  const { senderEmail } = await req.json();
  if (typeof senderEmail !== "string" || !senderEmail.trim()) {
    return NextResponse.json({ error: "sender_email_required" }, { status: 400 });
  }

  const event = await prisma.event.update({
    where: { id: eventId },
    data: { senderEmail: senderEmail.trim() },
    select: { senderEmail: true },
  });
  return NextResponse.json({ senderEmail: event.senderEmail });
}
