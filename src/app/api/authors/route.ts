import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { cleanBank, validateBank, setAuthorBank } from "@/lib/payers";

// Global payer list (all payers, all events) -- admin only. Event users work
// through /api/events/[id]/payers instead.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "admin_only" }, { status: 403 });

  const authors = await prisma.author.findMany({
    orderBy: { canonicalName: "asc" },
    include: {
      mergedInto: { select: { canonicalName: true } },
      eventAccess: { include: { event: { select: { id: true, name: true } } } },
    },
  });

  return NextResponse.json(authors);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "admin_only" }, { status: 403 });

  const body = await req.json();
  const name = typeof body.canonicalName === "string" ? body.canonicalName.trim().replace(/\s+/g, " ") : "";
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });

  const bank = cleanBank(body.bankAccountNumber, body.bankCode);
  const bankError = validateBank(bank);
  if (bankError) return NextResponse.json({ error: bankError }, { status: 400 });

  const author = await prisma.$transaction(async (tx) => {
    const created = await tx.author.create({ data: { canonicalName: name } });
    if (bank.account !== null) {
      await setAuthorBank(tx, { authorId: created.id, bank, userId: user.id, eventId: null, source: "create" });
    }
    return tx.author.findUniqueOrThrow({ where: { id: created.id } });
  });

  return NextResponse.json(author, { status: 201 });
}
