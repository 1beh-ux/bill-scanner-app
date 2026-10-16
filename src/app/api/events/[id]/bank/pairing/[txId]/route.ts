import { NextRequest, NextResponse } from "next/server";
import type { BankDifferenceReason } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { requireBank } from "@/lib/bank/guard";
import { pairTransaction } from "@/lib/bank/pairing";
import { hasModuleAccess } from "@/lib/module-access";
import { fold } from "@/lib/planning-import";

type Ctx = { params: Promise<{ id: string; txId: string }> };
const REASONS: BankDifferenceReason[] = ["fx", "fee", "rounding", "partial"];
const billSelect = { id: true, eventId: true, merchantName: true, billDate: true, amountCzk: true, totalAmount: true, currency: true, notes: true, originalFilename: true, status: true, payerAuthorId: true, paidToAuthor: true, documentMissing: true, bankMatches: { where: { confirmedAt: { not: null } }, select: { amountCzk: true } } } as const;

/**
 * Párování, right pane for one transaction: open suggestions (with reasons), the event's bills not
 * yet covered (searchable: ?q= merchant / amount / date / note), ?other=1 the same from other events
 * the user has Účtenky in, and for a payment to a payer that payer's unreimbursed bills (pre-ticked).
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id, txId } = await params;
  const ctx = await requireBank(id);
  if ("error" in ctx) return ctx.error;
  const tx = await prisma.bankTransaction.findFirst({
    where: { id: txId, eventId: id },
    include: { matches: { where: { rejectedAt: null }, orderBy: { score: "desc" }, include: { bill: { select: billSelect } } } },
  });
  if (!tx) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const q = fold(req.nextUrl.searchParams.get("q") ?? "");
  const other = req.nextUrl.searchParams.get("other") === "1";

  const remaining = (b: { amountCzk: unknown; bankMatches: { amountCzk: unknown }[] }) => Math.round((Number(b.amountCzk ?? 0) - b.bankMatches.reduce((s, m) => s + Number(m.amountCzk), 0)) * 100) / 100;
  const shape = (b: Awaited<ReturnType<typeof prisma.bill.findMany<{ select: typeof billSelect }>>>[number]) => ({
    id: b.id, eventId: b.eventId, merchantName: b.merchantName, billDate: b.billDate, amountCzk: b.amountCzk === null ? null : Number(b.amountCzk), totalAmount: b.totalAmount === null ? null : Number(b.totalAmount), currency: b.currency, notes: b.notes, originalFilename: b.originalFilename, status: b.status, documentMissing: b.documentMissing, remaining: remaining(b),
  });
  const matchesQ = (b: { merchantName: string | null; notes: string | null; amountCzk: unknown; billDate: Date | null; originalFilename: string }) =>
    !q || fold([b.merchantName, b.notes, b.originalFilename, String(b.amountCzk ?? ""), b.billDate?.toLocaleDateString("cs-CZ") ?? ""].join(" ")).includes(q);

  const bills = (await prisma.bill.findMany({ where: { eventId: id, status: { not: "failed" }, amountCzk: { not: null } }, select: billSelect, orderBy: { billDate: "asc" } }))
    .filter((b) => remaining(b) > 0.005 && matchesQ(b))
    .slice(0, 200)
    .map(shape);

  let otherBills: (ReturnType<typeof shape> & { eventName: string })[] = [];
  if (other) {
    const events = await prisma.event.findMany({ where: { organizationId: ctx.event.organizationId, id: { not: id }, status: "active" }, select: { id: true, name: true } });
    const allowed = [];
    for (const e of events) if (await hasModuleAccess(ctx.user, e.id, "bills")) allowed.push(e);
    const name = new Map(allowed.map((e) => [e.id, e.name]));
    const abs = Math.abs(Number(tx.amount));
    otherBills = (await prisma.bill.findMany({ where: { eventId: { in: allowed.map((e) => e.id) }, status: { notIn: ["failed", "approved"] }, amountCzk: { not: null } }, select: billSelect, orderBy: { billDate: "asc" } }))
      .filter((b) => (q ? matchesQ(b) : Math.abs(Number(b.amountCzk) - abs) < 0.005) && remaining(b) > 0.005)
      .slice(0, 50)
      .map((b) => ({ ...shape(b), eventName: name.get(b.eventId) ?? "" }));
  }

  const reimbursement = tx.reimbursementAuthorId
    ? {
        author: (await prisma.author.findUnique({ where: { id: tx.reimbursementAuthorId }, select: { id: true, canonicalName: true } }))!,
        billIds: (await prisma.bill.findMany({ where: { eventId: id, payerAuthorId: tx.reimbursementAuthorId, paidToAuthor: false, status: { not: "failed" } }, select: { id: true } })).map((b) => b.id),
      }
    : null;

  return NextResponse.json({
    tx: { ...tx, amount: Number(tx.amount), originalAmount: tx.originalAmount === null ? null : Number(tx.originalAmount), matches: undefined },
    confirmed: tx.matches.filter((m) => m.confirmedAt).map((m) => ({ id: m.id, amountCzk: Number(m.amountCzk), setPaidToAuthor: m.setPaidToAuthor, bill: shape(m.bill) })),
    suggestions: tx.matches.filter((m) => !m.confirmedAt).map((m) => ({ id: m.id, tier: m.tier, score: m.score, reasons: m.reasons, amountCzk: Number(m.amountCzk), bill: shape(m.bill) })),
    bills,
    otherBills,
    reimbursement,
  });
}

/** Spárovat: { billIds, differenceReason? } -> confirmed pairings. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id, txId } = await params;
  const ctx = await requireBank(id);
  if ("error" in ctx) return ctx.error;
  if (ctx.event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  const billIds: string[] = Array.isArray(body.billIds) ? body.billIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 200) : [];
  const r = await pairTransaction({ eventId: id, transactionId: txId, billIds, userId: ctx.user.id, differenceReason: REASONS.includes(body.differenceReason) ? body.differenceReason : null });
  return NextResponse.json(r, { status: "error" in r ? (r.error === "not_found" ? 404 : 400) : 200 });
}
