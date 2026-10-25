import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { participantScope } from "@/lib/participant-link";
import { takeRateSlot } from "@/lib/portal-rate";
import { countsAsReceived } from "@/lib/registration-status";
import { checkBankAccount } from "@/lib/bank/check";

// "Zkontrolovat platbu" on the participant's page (the portal's bank-check, for this one registration):
// asks the bank (self-throttled per account), answers only paid / not paid.
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { p, error } = await participantScope((await params).token, true);
  if (error) return error;
  if (!(await takeRateSlot(`bank:u_${p.id}`, 40, 10 * 60 * 1000))) return NextResponse.json({ error: "throttled" }, { status: 429 });
  const e = p.event;
  const on = p.active && p.registrationStatus === "accepted" && e.bankCheckEnabled && !!e.bankAccountId && !!e.paymentDocTypeId;
  if (on) await checkBankAccount(e.bankAccountId!, { reason: "portal" });
  const doc = on ? (await prisma.participantDocument.findMany({ where: { participantId: p.id, eventListItemId: e.paymentDocTypeId! } })).find(countsAsReceived) : undefined;
  return NextResponse.json({ payments: { [p.id]: doc ? { paid: true, paidAt: doc.receivedAt, via: doc.receivedVia } : { paid: false } } }, { headers: { "Cache-Control": "no-store" } });
}
