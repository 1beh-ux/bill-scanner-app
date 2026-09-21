import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { getAttachedPayer, cleanBank, validateBank, setAuthorBank } from "@/lib/payers";

// Edit a payer that is attached to this event: name and/or bank details
// (both bank keys together; null clears). Bank changes are audited.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; payerId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId, payerId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;

  const payer = await getAttachedPayer(eventId, payerId);
  if (!payer) return NextResponse.json({ error: "payer_not_found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const hasAccount = "bankAccountNumber" in body;
  const hasCode = "bankCode" in body;
  if (hasAccount !== hasCode) return NextResponse.json({ error: "bank_incomplete" }, { status: 400 });

  let name: string | undefined;
  if (body.canonicalName !== undefined) {
    name = typeof body.canonicalName === "string" ? body.canonicalName.trim().replace(/\s+/g, " ") : "";
    if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
    if (name.length > 120) return NextResponse.json({ error: "name_too_long" }, { status: 400 });
  }
  const bank = hasAccount ? cleanBank(body.bankAccountNumber, body.bankCode) : null;
  if (bank) {
    const bankError = validateBank(bank);
    if (bankError) return NextResponse.json({ error: bankError }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (name !== undefined && name !== payer.canonicalName) {
      await tx.author.update({ where: { id: payerId }, data: { canonicalName: name } });
    }
    if (bank) await setAuthorBank(tx, { authorId: payerId, bank, userId: user.id, eventId, source: "event_edit" });
    return tx.author.findUniqueOrThrow({ where: { id: payerId } });
  });

  return NextResponse.json({
    id: updated.id,
    canonicalName: updated.canonicalName,
    bankAccountNumber: updated.bankAccountNumber,
    bankCode: updated.bankCode,
  });
}

// Remove the payer from this event (deletes the AuthorEventAccess row only).
// Existing bills keep their payer; the payer just disappears from this event's
// pickers and list. With bills in the event the caller must confirm
// (?confirm=true) -- otherwise 409 payer_has_bills with the count.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; payerId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId, payerId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;

  const access = await prisma.authorEventAccess.findUnique({
    where: { authorId_eventId: { authorId: payerId, eventId } },
  });
  if (!access) return NextResponse.json({ error: "payer_not_found" }, { status: 404 });

  const billCount = await prisma.bill.count({ where: { eventId, payerAuthorId: payerId } });
  if (billCount > 0 && new URL(req.url).searchParams.get("confirm") !== "true") {
    return NextResponse.json({ error: "payer_has_bills", billCount }, { status: 409 });
  }

  await prisma.authorEventAccess.delete({ where: { authorId_eventId: { authorId: payerId, eventId } } });
  return NextResponse.json({ ok: true, billCount });
}
