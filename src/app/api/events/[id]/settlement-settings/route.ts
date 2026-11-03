import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { encryptBankToken } from "@/lib/bank/token-crypto";
import { receiverOf } from "@/lib/settlement-links";
import { MESSAGE_CASES, messagesOf } from "@/lib/settlement-message";

// Vyúčtování settings (Platby): GET where people pay the event and whether it's confirmed automatically;
// PATCH { receiver: "treasurer" | "event" }, { messages: { owes, owed, bothOwes, bothOwed } } (the texts sent with the links)
// and/or { fioToken: string | null } -- the Pokladník's own Fio API
// token (read-only), stored encrypted, never sent back.
async function guard(eventId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const denied = await requireModuleAccess(user, eventId, "bills");
  return denied ? { error: denied } : { user };
}

async function state(eventId: string) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { id: true, name: true, treasurerAuthorId: true, settlementReceiver: true, settlementMessages: true, bankAccountId: true, bankAccount: { select: { label: true } } } });
  const treasurer = event.treasurerAuthorId ? await prisma.author.findUnique({ where: { id: event.treasurerAuthorId }, select: { canonicalName: true, bankAccountNumber: true, fioTokenEncrypted: true, fioTokenSetAt: true, fioLastSuccessAt: true, fioLastError: true } }) : null;
  const receiver = await receiverOf(event);
  return {
    receiverMode: event.settlementReceiver,
    eventName: event.name,
    messages: messagesOf(event.settlementMessages),
    receiver: receiver && { kind: receiver.kind, name: receiver.name, hasAccount: !!receiver.bankAccountNumber, autoConfirm: receiver.autoConfirm },
    eventAccount: event.bankAccount ? { label: event.bankAccount.label } : null,
    treasurer: treasurer && { name: treasurer.canonicalName, hasAccount: !!treasurer.bankAccountNumber, fioToken: !!treasurer.fioTokenEncrypted, fioTokenSetAt: treasurer.fioTokenSetAt, fioLastSuccessAt: treasurer.fioLastSuccessAt, fioLastError: treasurer.fioLastError },
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  return NextResponse.json(await state(id));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  const b = (await req.json().catch(() => ({}))) as { receiver?: unknown; fioToken?: unknown; messages?: unknown };
  if (b.messages && typeof b.messages === "object") {
    const m = b.messages as Record<string, unknown>;
    const clean = Object.fromEntries(MESSAGE_CASES.map((k) => [k, typeof m[k] === "string" ? (m[k] as string).slice(0, 2000) : ""]));
    await prisma.event.update({ where: { id }, data: { settlementMessages: clean } });
  }
  if (b.receiver === "treasurer" || b.receiver === "event") await prisma.event.update({ where: { id }, data: { settlementReceiver: b.receiver } });
  if (b.fioToken !== undefined) {
    const event = await prisma.event.findUniqueOrThrow({ where: { id }, select: { treasurerAuthorId: true } });
    if (!event.treasurerAuthorId) return NextResponse.json({ error: "no_treasurer" }, { status: 400 });
    const token = typeof b.fioToken === "string" ? b.fioToken.trim() : "";
    if (token && !/^[A-Za-z0-9]{20,128}$/.test(token)) return NextResponse.json({ error: "bad_token" }, { status: 400 });
    await prisma.author.update({
      where: { id: event.treasurerAuthorId },
      data: token ? { fioTokenEncrypted: encryptBankToken(token), fioTokenSetAt: new Date(), fioLastError: null, fioLastCheckedAt: null } : { fioTokenEncrypted: null, fioTokenSetAt: null, fioLastError: null },
    });
  }
  return NextResponse.json(await state(id));
}
