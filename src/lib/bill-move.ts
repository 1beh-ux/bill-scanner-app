import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";

export interface MoveResult {
  ok: boolean;
  error?: string;
  matchedCategories?: number;
  droppedCategories?: number;
}

export async function moveBillToEvent(
  billId: string,
  targetEventId: string,
  userId: string
): Promise<MoveResult> {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: {
      categories: { include: { eventCategory: true } },
      event: { select: { id: true, name: true, status: true } },
    },
  });

  if (!bill) return { ok: false, error: "not_found" };
  if (bill.status === "approved") return { ok: false, error: "bill_approved_locked" };
  if (bill.status === "queued" || bill.status === "processing") {
    return { ok: false, error: "bill_processing_locked" };
  }
  if (bill.event.status === "closed") return { ok: false, error: "event_closed_locked" };
  if (bill.eventId === targetEventId) return { ok: false, error: "already_in_event" };

  const targetEvent = await prisma.event.findUnique({ where: { id: targetEventId } });
  if (!targetEvent) return { ok: false, error: "target_event_not_found" };
  if (targetEvent.status === "closed") return { ok: false, error: "event_closed_locked" };

  const targetCategories = await prisma.eventCategory.findMany({
    where: { eventId: targetEventId },
    select: { id: true, name: true },
  });
  const targetByName = new Map(targetCategories.map((c) => [c.name.trim().toLowerCase(), c.id]));

  let matchedCategories = 0;
  let droppedCategories = 0;
  const newSplits: { eventCategoryId: string; amount: Prisma.Decimal; amountCzk: Prisma.Decimal | null }[] = [];

  for (const cat of bill.categories) {
    const targetId = targetByName.get(cat.eventCategory.name.trim().toLowerCase());
    if (targetId) {
      matchedCategories++;
      newSplits.push({ eventCategoryId: targetId, amount: cat.amount, amountCzk: cat.amountCzk });
    } else {
      droppedCategories++;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.billCategory.deleteMany({ where: { billId } });

    if (newSplits.length > 0) {
      await tx.billCategory.createMany({
        data: newSplits.map((s) => ({
          billId,
          eventCategoryId: s.eventCategoryId,
          amount: s.amount,
          amountCzk: s.amountCzk,
        })),
      });
    }

    if (bill.payerAuthorId) {
      const existingAccess = await tx.authorEventAccess.findUnique({
        where: { authorId_eventId: { authorId: bill.payerAuthorId, eventId: targetEventId } },
      });
      if (!existingAccess) {
        await tx.authorEventAccess.create({
          data: { authorId: bill.payerAuthorId, eventId: targetEventId },
        });
      }
    }

    await tx.bill.update({ where: { id: billId }, data: { eventId: targetEventId } });

    // Reusing the existing "edit" action type rather than adding a new enum
    // value for this — old/new values are the event NAMES here (not IDs),
    // a deliberate departure from this log's usual raw-value convention,
    // since a UUID would be meaningless to anyone actually reading it.
    await tx.billAuditLog.create({
      data: {
        billId,
        userId,
        actionType: "edit",
        fieldName: "eventId",
        oldValue: bill.event.name,
        newValue: targetEvent.name,
      },
    });
  });

  return { ok: true, matchedCategories, droppedCategories };
}