import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import type { Currency } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { extractBillWithAi } from "@/lib/ai-extraction";
import { convertToCzk } from "@/lib/exchange-rates";

const VALID_CURRENCIES = ["CZK", "PLN", "EUR"];

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
  if (bill.status === "approved") {
    return NextResponse.json({ error: "bill_approved_locked" }, { status: 409 });
  }
  if (bill.event.status === "closed") {
    return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  }

  const eventCategories = await prisma.eventCategory.findMany({
    where: { eventId: bill.eventId },
    select: { id: true, name: true, description: true },
  });

  if (eventCategories.length === 0) {
    return NextResponse.json({ error: "no_categories" }, { status: 400 });
  }

  await prisma.bill.update({ where: { id }, data: { status: "processing" } });

  let aiResult;
  try {
    aiResult = await extractBillWithAi(bill.gcsObjectPath, bill.originalFilename, eventCategories);
  } catch (err) {
    await prisma.bill.update({
      where: { id },
      data: { status: "failed", aiRawResponse: { error: String(err) } },
    });
    return NextResponse.json({ error: "ai_call_failed" }, { status: 502 });
  }

  const data = aiResult.data;
  const matchedCategory = data.category
    ? eventCategories.find((c) => c.name === data.category)
    : undefined;

  const newStatus =
    aiResult.status === "AUTO_APPROVE"
      ? "auto_approved"
      : aiResult.status === "NEEDS_REVIEW"
        ? "to_review"
        : "failed";

  const currency = (
    data.currency && VALID_CURRENCIES.includes(data.currency) ? data.currency : "CZK"
  ) as Currency;
  const totalAmount = data.total_amount !== null ? new Prisma.Decimal(data.total_amount) : null;
  const billDate = data.invoice_date ? new Date(data.invoice_date) : null;

  let amountCzk: Prisma.Decimal | null = null;
  let exchangeRateUsed: Prisma.Decimal | null = null;
  let exchangeRateDate: Date | null = null;

  if (totalAmount !== null) {
    if (currency === "CZK") {
      amountCzk = totalAmount;
      exchangeRateUsed = new Prisma.Decimal(1);
      exchangeRateDate = billDate;
    } else if (billDate) {
      const conv = await convertToCzk(totalAmount, currency, billDate);
      if (conv) {
        amountCzk = conv.amountCzk;
        exchangeRateUsed = conv.rateUsed;
        exchangeRateDate = conv.rateDate;
      }
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedBill = await tx.bill.update({
      where: { id },
      data: {
        merchantName: data.merchant_name,
        billDate,
        totalAmount,
        currency,
        amountCzk,
        exchangeRateUsed,
        exchangeRateDate,
        notes: data.notes,
        aiConfidence: new Prisma.Decimal(data.confidence),
        aiRawResponse: aiResult as unknown as Prisma.InputJsonValue,
        status: newStatus,
      },
    });

    // Single-category split at the full bill amount — matches what a human
    // would do for a straightforward receipt. Multi-category splitting isn't
    // something the AI is asked to attempt; a human can always adjust this
    // before approving, same as any manually-entered bill.
    if (matchedCategory && totalAmount !== null) {
      await tx.billCategory.deleteMany({ where: { billId: id } });
      await tx.billCategory.create({
        data: {
          billId: id,
          eventCategoryId: matchedCategory.id,
          amount: totalAmount,
          amountCzk,
        },
      });
    }

    return updatedBill;
  });

  return NextResponse.json({ ok: true, status: newStatus, bill: updated });
}