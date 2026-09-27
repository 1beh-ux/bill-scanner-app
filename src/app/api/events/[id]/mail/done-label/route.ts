import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { requireEventSenderEmail } from "@/lib/mail-helper-context";
import { doneLabelName, ensureDoneLabel } from "@/lib/mail-read";

// Nastavení akce -> Pošta: does the "done" label exist in the event's mailbox
// (GET), create it now (POST). Moving an e-mail creates it anyway.
async function handle(req: NextRequest, params: Promise<{ id: string }>, create: boolean) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "mail");
  if (denied) return denied;

  let senderEmail: string;
  try {
    senderEmail = await requireEventSenderEmail(eventId);
  } catch {
    return NextResponse.json({ error: "sender_not_configured" }, { status: 409 });
  }
  const name = doneLabelName(await prisma.event.findUnique({ where: { id: eventId }, select: { mailDoneLabelName: true } }));
  try {
    const { id, created } = await ensureDoneLabel(senderEmail, name, create);
    return NextResponse.json({ name, mailbox: senderEmail, exists: !!id, created });
  } catch (err) {
    console.error("[mail done-label] failed", err);
    return NextResponse.json({ error: "gmail_failed", name, mailbox: senderEmail }, { status: 502 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(req, params, false);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(req, params, true);
}
