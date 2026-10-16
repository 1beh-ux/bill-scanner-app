import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBillAccess } from "@/lib/bank/bill-access";
import { getBillPaymentState } from "@/lib/bank/payment-state";
import { hasBankAccess } from "@/lib/bank/guard";

type Ctx = { params: Promise<{ id: string }> };

// Bill detail -> Platba: the payment state and the paired payments (date, amount; the counterparty
// only for someone with Banka -- transaction details stay inside Banka).
export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await requireBillAccess((await params).id);
  if ("error" in a) return a.error;
  const enabled = !!(await prisma.eventModule.findFirst({ where: { eventId: a.bill.eventId, moduleKey: "bank", enabled: true }, select: { eventId: true } }));
  const bank = await hasBankAccess(a.user, a.bill.eventId);
  const matches = await prisma.bankMatch.findMany({
    where: { billId: a.bill.id, confirmedAt: { not: null } },
    select: { id: true, amountCzk: true, amountTx: true, setPaidToAuthor: true, transaction: { select: { id: true, bookingDate: true, amount: true, currency: true, originalAmount: true, originalCurrency: true, counterpartyName: true, counterpartyAccount: true, counterpartyBankCode: true } } },
  });
  const state = await getBillPaymentState(a.bill);
  const paired = matches.reduce((s, m) => s + Number(m.amountCzk), 0);
  return NextResponse.json({
    enabled,
    bankAccess: bank,
    ...state,
    channel: a.bill.paymentChannel,
    note: a.bill.paymentNote,
    // A document attached later can show another amount than the paired payment.
    amountMismatch: matches.length > 0 && a.bill.amountCzk !== null && Math.abs(Number(a.bill.amountCzk) - paired) > 0.005,
    matches: matches.map((m) => ({
      id: m.id,
      amountCzk: Number(m.amountCzk),
      setPaidToAuthor: m.setPaidToAuthor,
      date: m.transaction.bookingDate,
      amount: Number(m.transaction.amount),
      currency: m.transaction.currency,
      amountTx: Number(m.amountTx ?? m.amountCzk),
      original: m.transaction.originalCurrency && m.transaction.originalAmount !== null ? { amount: Number(m.transaction.originalAmount), currency: m.transaction.originalCurrency } : null,
      ...(bank && { counterparty: m.transaction.counterpartyName ?? (m.transaction.counterpartyAccount ? `${m.transaction.counterpartyAccount}/${m.transaction.counterpartyBankCode ?? ""}` : null) }),
    })),
  });
}

/** Hotově / Jiný účet (+ note) by hand; { channel: null } clears it. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = await requireBillAccess((await params).id);
  if ("error" in a) return a.error;
  const body = await req.json().catch(() => ({}));
  const channel = body.channel === "cash" || body.channel === "other_account" ? body.channel : body.channel === null ? null : undefined;
  if (channel === undefined) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  await prisma.$transaction([
    prisma.bill.update({ where: { id: a.bill.id }, data: { paymentChannel: channel, paymentNote: channel && typeof body.note === "string" ? body.note.slice(0, 300) || null : null } }),
    prisma.billAuditLog.create({ data: { billId: a.bill.id, userId: a.user.id, actionType: "bank_channel", fieldName: "paymentChannel", oldValue: a.bill.paymentChannel, newValue: channel } }),
    // A hand-set channel ends open suggestions for this bill.
    ...(channel ? [prisma.bankMatch.deleteMany({ where: { billId: a.bill.id, confirmedAt: null, rejectedAt: null } })] : []),
  ]);
  return NextResponse.json({ ok: true });
}
