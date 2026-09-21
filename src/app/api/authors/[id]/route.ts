import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { cleanBank, validateBank, setAuthorBank } from "@/lib/payers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }

  const { id } = await params;
  const author = await prisma.author.findUnique({ where: { id } });

  if (!author) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(author);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { canonicalName, active } = body;

  const hasAccount = "bankAccountNumber" in body;
  const hasCode = "bankCode" in body;
  if (hasAccount !== hasCode) return NextResponse.json({ error: "bank_incomplete" }, { status: 400 });
  const bank = hasAccount ? cleanBank(body.bankAccountNumber, body.bankCode) : null;
  if (bank) {
    const bankError = validateBank(bank);
    if (bankError) return NextResponse.json({ error: bankError }, { status: 400 });
  }
  if (canonicalName !== undefined && !String(canonicalName).trim()) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  const author = await prisma.$transaction(async (tx) => {
    await tx.author.update({
      where: { id },
      data: {
        ...(canonicalName !== undefined && { canonicalName: String(canonicalName).trim().replace(/\s+/g, " ") }),
        ...(active !== undefined && { active }),
      },
    });
    if (bank) await setAuthorBank(tx, { authorId: id, bank, userId: user.id, eventId: null, source: "admin_edit" });
    return tx.author.findUniqueOrThrow({ where: { id } });
  });

  return NextResponse.json(author);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }

  const { id } = await params;

  try {
    await prisma.author.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json(
        { error: "Nelze smazat autora s existujícími vazbami (např. účty)." },
        { status: 409 }
      );
    }
    throw err;
  }
}
