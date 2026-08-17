import { Prisma } from "@/generated/prisma";
import type { Bill, Currency } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { extractBillWithAi } from "@/lib/ai-extraction";
import { convertToCzk } from "@/lib/exchange-rates";
import { resolveCanonicalMerchant } from "@/lib/merchant-aliases";

const VALID_CURRENCIES = ["CZK", "PLN", "EUR"];

export type ProcessBillAiResult =
  | { ok: true; status: string; bill: Bill }
  | { ok: false; error: string };

/**
 * Runs AI extraction for a single bill end to end: downloads the file from
 * GCS, calls the extraction service, and writes the result back to the
 * bill (and its category split) in one transaction.
 *
 * This is the ONLY place this logic lives. Both the interactive
 * "reprocess" button (src/app/api/bills/[id]/process-ai) and the Cloud
 * Tasks worker (src/app/api/tasks/process-bill-ai/[id]) call this
 * function directly rather than each having their own copy — previously
 * bulk-ai/route.ts had a near-duplicate of this that had already started
 * drifting from the single-bill route. One implementation means a fix
 * here fixes both callers at once.
 */
export async function processBillWithAi(billId: string): Promise<ProcessBillAiResult> {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { event: { select: { status: true } } },
  });

  if (!bill) return { ok: false, error: "not_found" };
  if (bill.status === "approved") return { ok: false, error: "bill_approved_locked" };
  if (bill.event.status === "closed") return { ok: false, error: "event_closed_locked" };

  const eventCategories = await prisma.eventCategory.findMany({
    where: { eventId: bill.eventId },
    select: { id: true, name: true, description: true },
  });
  if (eventCategories.length === 0) return { ok: false, error: "no_categories" };

  // Transition to "processing" right before the actual extraction call —
  // this is what makes the bill list's status pills and polling reflect
  // real progress instead of every queued bill looking identical until
  // the whole run finishes.
  await prisma.bill.update({ where: { id: billId }, data: { status: "processing" } });

  let aiResult;
  try {
    aiResult = await extractBillWithAi(bill.gcsObjectPath, bill.originalFilename, eventCategories);
  } catch (err) {
    await prisma.bill.update({
      where: { id: billId },
      data: { status: "failed", aiRawResponse: { error: String(err) } },
    });
    return { ok: false, error: "ai_call_failed" };
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

  const updated = await prisma.$transaction(async (tx) => {
    const updatedBill = await tx.bill.update({
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

    // Single-category split at the full bill amount — matches what a human
    // would do for a straightforward receipt. Multi-category splitting isn't
    // something the AI is asked to attempt; a human can always adjust this
    // before approving, same as any manually-entered bill.
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

    return updatedBill;
  });

  return { ok: true, status: newStatus, bill: updated };
}
