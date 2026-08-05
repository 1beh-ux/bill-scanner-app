import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

  const { id } = await params;
  const body = await req.json();
  const { canonicalName, bankAccountNumber, bankCode, active } = body;

  const author = await prisma.author.update({
    where: { id },
    data: {
      ...(canonicalName !== undefined && { canonicalName }),
      ...(bankAccountNumber !== undefined && { bankAccountNumber: bankAccountNumber || null }),
      ...(bankCode !== undefined && { bankCode: bankCode || null }),
      ...(active !== undefined && { active }),
    },
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
