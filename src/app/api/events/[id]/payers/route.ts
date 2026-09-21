import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { cleanBank, validateBank, findSimilarAuthors, setAuthorBank } from "@/lib/payers";

// Payers (Plátci) attached to this event -- what every event-context picker,
// the payments page and the event payers page read. Access: bills on the event.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;

  const access = await prisma.authorEventAccess.findMany({
    where: { eventId, author: { active: true, mergedIntoAuthorId: null } },
    include: {
      author: {
        include: {
          bankAudits: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { changedByUser: { select: { displayName: true } } },
          },
        },
      },
    },
  });
  const counts = await prisma.bill.groupBy({
    by: ["payerAuthorId"],
    where: { eventId, payerAuthorId: { in: access.map((a) => a.authorId) } },
    _count: { _all: true },
  });
  const billCount = new Map(counts.map((c) => [c.payerAuthorId, c._count._all]));

  const payers = access
    .map((a) => {
      const last = a.author.bankAudits[0];
      return {
        id: a.author.id,
        canonicalName: a.author.canonicalName,
        bankAccountNumber: a.author.bankAccountNumber,
        bankCode: a.author.bankCode,
        billCount: billCount.get(a.author.id) ?? 0,
        // Latest bank-detail change; the UI shows the "changed <date> by <name>"
        // hint only when it is recent (RECENT_BANK_CHANGE_DAYS).
        lastBankChange: last
          ? { at: last.createdAt, byName: last.changedByUser.displayName, source: last.source }
          : null,
      };
    })
    .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, "cs"));

  return NextResponse.json(payers);
}

// Attach an existing payer (`authorId`, bank details are not touched) or create
// a new one (`canonicalName` + optional bank details) and attach it. Creating
// a name that looks like an existing payer answers 409 similar_payer_exists
// with the names, until the caller repeats it with confirmSimilar: true.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  if (body.authorId) {
    const author = await prisma.author.findUnique({ where: { id: String(body.authorId) } });
    if (!author || !author.active || author.mergedIntoAuthorId) {
      return NextResponse.json({ error: "payer_not_found" }, { status: 404 });
    }
    await prisma.authorEventAccess.upsert({
      where: { authorId_eventId: { authorId: author.id, eventId } },
      update: {},
      create: { authorId: author.id, eventId },
    });
    return NextResponse.json(
      { id: author.id, canonicalName: author.canonicalName, bankAccountNumber: author.bankAccountNumber, bankCode: author.bankCode },
      { status: 201 }
    );
  }

  const name = typeof body.canonicalName === "string" ? body.canonicalName.trim().replace(/\s+/g, " ") : "";
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ error: "name_too_long" }, { status: 400 });

  const bank = cleanBank(body.bankAccountNumber, body.bankCode);
  const bankError = validateBank(bank);
  if (bankError) return NextResponse.json({ error: bankError }, { status: 400 });

  if (body.confirmSimilar !== true) {
    const similar = await findSimilarAuthors(name);
    if (similar.length > 0) return NextResponse.json({ error: "similar_payer_exists", similar }, { status: 409 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const author = await tx.author.create({ data: { canonicalName: name } });
    await tx.authorEventAccess.create({ data: { authorId: author.id, eventId } });
    if (bank.account !== null) {
      await setAuthorBank(tx, { authorId: author.id, bank, userId: user.id, eventId, source: "create" });
    }
    return tx.author.findUniqueOrThrow({ where: { id: author.id } });
  });

  return NextResponse.json(
    { id: created.id, canonicalName: created.canonicalName, bankAccountNumber: created.bankAccountNumber, bankCode: created.bankCode },
    { status: 201 }
  );
}
