import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { portalScope } from "@/lib/portal-server";
import { takeRateSlot } from "@/lib/portal-rate";
import { countsAsReceived } from "@/lib/registration-status";
import { checkBankAccount } from "@/lib/bank/check";

// Portal "Zkontrolovat platbu" (docs/bank-payments-design.md): checks the bank
// for this family's accepted registrations in events with the bank check on,
// then answers ONLY whether each is paid -- nothing about the account or movements.
// The portal polls every 10 s for 2 minutes after showing the QR.
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { scope, error } = await portalScope(token, true);
  if (error) return error;
  if (!(await takeRateSlot(`bank:${scope.id}`, 40, 10 * 60 * 1000))) return NextResponse.json({ error: "throttled" }, { status: 429 });

  const participants = await prisma.participant.findMany({
    where: {
      childId: { in: scope.members.map((m) => m.id) },
      active: true,
      registrationStatus: "accepted",
      event: { bankCheckEnabled: true, bankAccountId: { not: null }, paymentDocTypeId: { not: null }, status: "active" },
    },
    select: { id: true, event: { select: { bankAccountId: true, paymentDocTypeId: true } } },
  });
  // checkBankAccount throttles itself (35 s per account); its result isn't the parent's business.
  for (const accountId of new Set(participants.map((p) => p.event.bankAccountId!))) await checkBankAccount(accountId, { reason: "portal" });

  const docs = await prisma.participantDocument.findMany({
    where: { participantId: { in: participants.map((p) => p.id) } },
    select: { participantId: true, eventListItemId: true, receivedVia: true, reviewStatus: true, receivedAt: true },
  });
  const payments: Record<string, { paid: boolean; paidAt?: Date; via?: string }> = {};
  for (const p of participants) {
    const doc = docs.find((d) => d.participantId === p.id && d.eventListItemId === p.event.paymentDocTypeId && countsAsReceived(d));
    payments[p.id] = doc ? { paid: true, paidAt: doc.receivedAt, via: doc.receivedVia } : { paid: false };
  }
  return NextResponse.json({ payments }, { headers: { "Cache-Control": "no-store" } });
}
