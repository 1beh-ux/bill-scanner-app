import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Prisma, type Currency } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { convertToCzk } from "@/lib/exchange-rates";

// "Ruční zadání" (2026-11-01): an official bill typed in by hand -- an estimate, or a bill whose document isn't
// here yet. It counts in Rozpočet and the totals like any bill; "chybí doklad" until a document is uploaded
// onto it (Nahrát doklad -- the AI then reads it). POST { billDate, merchantName, totalAmount, currency,
// payerAuthorId? (none = Akce), eventCategoryId?, notes? }.
const CURRENCIES: Currency[] = ["CZK", "EUR", "PLN"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { status: true } });
  if (event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const total = Number(String(b.totalAmount ?? "").replace(",", "."));
  const billDate = typeof b.billDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.billDate) ? new Date(`${b.billDate}T00:00:00Z`) : null;
  const currency = CURRENCIES.includes(b.currency as Currency) ? (b.currency as Currency) : "CZK";
  if (!(total > 0 && total < 100_000_000) || !billDate) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const merchantName = typeof b.merchantName === "string" ? b.merchantName.trim().slice(0, 200) || null : null;
  const notes = typeof b.notes === "string" ? b.notes.trim().slice(0, 2000) || null : null;
  // Payer and category of this event only.
  const payerAuthorId =
    typeof b.payerAuthorId === "string" && b.payerAuthorId
      ? (await prisma.authorEventAccess.findFirst({ where: { eventId, authorId: b.payerAuthorId }, select: { authorId: true } }))?.authorId
      : null;
  if (payerAuthorId === undefined) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const category =
    typeof b.eventCategoryId === "string" && b.eventCategoryId ? await prisma.eventCategory.findFirst({ where: { id: b.eventCategoryId, eventId }, select: { id: true } }) : null;
  if (b.eventCategoryId && !category) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const amount = new Prisma.Decimal(total.toFixed(2));
  const conv = await convertToCzk(amount, currency, billDate);
  const bill = await prisma.$transaction(async (tx) => {
    const created = await tx.bill.create({
      data: {
        eventId,
        gcsObjectPath: null,
        originalFilename: `Ruční zadání ${b.billDate} ${total.toFixed(2)} ${currency === "CZK" ? "Kč" : currency}`,
        contentHash: `manual:${crypto.randomUUID()}`,
        ingestChannel: "manual",
        createdByUserId: user.id,
        status: "to_review",
        merchantName,
        billDate,
        totalAmount: amount,
        currency,
        amountCzk: conv ? conv.amountCzk : null,
        exchangeRateUsed: conv ? conv.rateUsed : null,
        exchangeRateDate: conv ? conv.rateDate : null,
        payerAuthorId,
        documentMissing: true,
        notes,
      },
      select: { id: true },
    });
    if (category) await tx.billCategory.create({ data: { billId: created.id, eventCategoryId: category.id, amount, amountCzk: conv ? conv.amountCzk : null } });
    await tx.billAuditLog.create({ data: { billId: created.id, userId: user.id, actionType: "edit", fieldName: "manual", newValue: `${b.billDate} ${total.toFixed(2)} ${currency}` } });
    return created;
  });
  return NextResponse.json(bill, { status: 201 });
}
