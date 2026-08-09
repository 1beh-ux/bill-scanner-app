import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import type { Currency } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { extractBillWithAi } from "@/lib/ai-extraction";
import { convertToCzk } from "@/lib/exchange-rates";
import { resolveCanonicalMerchant } from "@/lib/merchant-aliases";

const CONCURRENCY = 3;
const MAX_BILLS_PER_RUN = 20;
const VALID_CURRENCIES = ["CZK", "PLN", "EUR"];

interface BillResult {
  billId: string;
  ok: boolean;
  status?: string;
  error?: string;
}

async function processOneBill(
  billId: string,
  eventCategories: { id: string; name: string; description: string | null }[]
): Promise<BillResult> {
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill) return { billId, ok: false, error: "not_found" };
  if (bill.status === "approved") return { billId, ok: false, error: "bill_approved_locked" };

  // Transition queued -> processing right as this bill's turn actually comes
  // up in the batch, not all at once at the start — this is what makes the
  // status bar reflect real progress instead of everyone showing the same
  // state regardless of whether they've actually started yet.
  await prisma.bill.update({ where: { id: billId }, data: { status: "processing" } });

  let aiResult;
  try {
    aiResult = await extractBillWithAi(bill.gcsObjectPath, bill.originalFilename, eventCategories);
  } catch (err) {
    await prisma.bill.update({
      where: { id: billId },
      data: { status: "failed", aiRawResponse: { error: String(err) } },
    });
    return { billId, ok: false, error: "ai_call_failed" };
  }

  const data = aiResult.data;
  let matchedCategory = data.category
    ? eventCategories.find((c) => c.name === data.category)
    : undefined;
  // A category chosen at import time, before AI ever ran, is a deliberate
  // human decision — it takes precedence over whatever AI guessed.
  if (bill.pendingCategoryId) {
    const pending = eventCategories.find((c) => c.id === bill.pendingCategoryId);
    if (pending) matchedCategory = pending;
  }
  const canonicalMerchant = await resolveCanonicalMerchant(data.merchant_name);

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

  await prisma.$transaction(async (tx) => {
    await tx.bill.update({
      where: { id: billId },
      data: {
        merchantName: canonicalMerchant ?? data.merchant_name,
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
        pendingCategoryId: null,
      },
    });

    if (matchedCategory && totalAmount !== null) {
      await tx.billCategory.deleteMany({ where: { billId } });
      await tx.billCategory.create({
        data: {
          billId,
          eventCategoryId: matchedCategory.id,
          amount: totalAmount,
          amountCzk,
        },
      });
    }
  });

  return { billId, ok: true, status: newStatus };
}

async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(worker));
    results.push(...batchResults);
  }
  return results;
}

async function runBulkAiJob(
  billIds: string[],
  eventCategories: { id: string; name: string; description: string | null }[]
) {
  try {
    await processInBatches(billIds, CONCURRENCY, (billId) => processOneBill(billId, eventCategories));
  } catch (err) {
    console.error("[bulk-ai] unexpected top-level error", err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: eventId } = await params;
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (event.status === "closed") {
    return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const billIds: string[] = Array.isArray(body.billIds) ? body.billIds : [];

  if (billIds.length === 0) {
    return NextResponse.json({ error: "no_bills_selected" }, { status: 400 });
  }
  if (billIds.length > MAX_BILLS_PER_RUN) {
    return NextResponse.json({ error: "too_many_bills", max: MAX_BILLS_PER_RUN }, { status: 400 });
  }

  const eventCategories = await prisma.eventCategory.findMany({
    where: { eventId },
    select: { id: true, name: true, description: true },
  });
  if (eventCategories.length === 0) {
    return NextResponse.json({ error: "no_categories" }, { status: 400 });
  }

  // Queued, not processing — processing is set individually, per bill,
  // right as each one's turn actually comes up inside the batch loop.
  await prisma.bill.updateMany({
    where: { id: { in: billIds } },
    data: { status: "queued" },
  });

  // Deliberately not awaited — see ai-extraction.ts / gcs comments elsewhere
  // for why this needs --no-cpu-throttling in production to be reliable.
  void runBulkAiJob(billIds, eventCategories);

  return NextResponse.json({ started: true, count: billIds.length });
}