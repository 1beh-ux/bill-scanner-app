import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { takeRateSlot } from "@/lib/portal-rate";
import { cleanBank, validateBank, setAuthorBank } from "@/lib/payers";
import { buildStatement } from "@/lib/settlement-statement";
import { checkSettlementPayments, settlePair } from "@/lib/settlement-links";

// Vyúčtování, the public link (/vyuctovani/<event>/<token>, no login -- the token is the address): GET this
// person's statement; POST { action }:
//   paid / unpaid          "Zaplatil(a) jsem" to the event (their claim) / undone
//   received / unreceived  "Peníze jsem dostal(a)" (their payout arrived) / undone
//   accept / unaccept      "Souhlasím s vyúčtováním" (the event pays them: this amount and content are right)
//   pairPaid / pairUnpaid { creditorId }  person to person: "I paid them"
//   pairReceived { debtorId }  the creditor confirms -> those shares settled
//   bank { account, code }  where their payout goes (logged, shown as "recently changed" on Platby)
//   check                   ask the bank now (throttled per token)
const noStore = { "Cache-Control": "no-store" };

async function linkOf(token: string) {
  if (!token || token.length > 64) return null;
  const link = await prisma.settlementLink.findUnique({ where: { token } });
  if (!link) return null;
  return link;
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const link = await linkOf((await params).token);
  if (!link) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(await buildStatement(link), { headers: noStore });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const link = await linkOf((await params).token);
  if (!link) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await takeRateSlot(`settle:${link.id}`, 60, 10 * 60 * 1000))) return NextResponse.json({ error: "throttled" }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; creditorId?: unknown; debtorId?: unknown; account?: unknown; code?: unknown };
  const claims = { ...((link.pairClaims ?? {}) as Record<string, string>) };
  switch (b.action) {
    case "paid":
    case "unpaid":
      await prisma.settlementLink.update({ where: { id: link.id }, data: { claimedAt: b.action === "paid" ? new Date() : null } });
      break;
    case "received":
    case "unreceived":
      await prisma.settlementLink.update({ where: { id: link.id }, data: { receivedAt: b.action === "received" ? new Date() : null } });
      break;
    case "accept":
    case "unaccept": {
      const { eventNetting } = await import("@/lib/settlement-links");
      const net = (await eventNetting(link.eventId)).net.rows.find((r) => r.authorId === link.authorId)?.net ?? 0;
      await prisma.settlementLink.update({ where: { id: link.id }, data: b.action === "accept" ? { acceptedAt: new Date(), acceptedAmount: net } : { acceptedAt: null, acceptedAmount: null } });
      break;
    }
    case "pairPaid":
    case "pairUnpaid":
      if (typeof b.creditorId !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
      if (b.action === "pairPaid") claims[b.creditorId] = new Date().toISOString();
      else delete claims[b.creditorId];
      await prisma.settlementLink.update({ where: { id: link.id }, data: { pairClaims: claims } });
      break;
    case "pairReceived": {
      // Only a debt really owed to this person: the shares of bills they authored, outside the event.
      if (typeof b.debtorId !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
      const n = await settlePair(link.eventId, b.debtorId, link.authorId, null);
      if (!n) return NextResponse.json({ error: "not_found" }, { status: 404 });
      break;
    }
    case "bank": {
      const bank = cleanBank(String(b.account ?? ""), String(b.code ?? ""));
      const invalid = !bank.account || !bank.code ? "bank_incomplete" : validateBank(bank);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
      await prisma.$transaction((tx) => setAuthorBank(tx, { authorId: link.authorId, bank, userId: null, eventId: link.eventId, source: "settlement_link" }));
      break;
    }
    case "check":
      await checkSettlementPayments(link.eventId);
      break;
    default:
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  return NextResponse.json(await buildStatement((await prisma.settlementLink.findUnique({ where: { id: link.id } }))!), { headers: noStore });
}
