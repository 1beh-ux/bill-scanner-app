import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const authors = await prisma.author.findMany({
    orderBy: { canonicalName: "asc" },
  });

  return NextResponse.json(authors);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { canonicalName, bankAccountNumber, bankCode } = body;

  if (!canonicalName) {
    return NextResponse.json({ error: "canonicalName is required" }, { status: 400 });
  }

  const author = await prisma.author.create({
    data: {
      canonicalName,
      bankAccountNumber: bankAccountNumber || null,
      bankCode: bankCode || null,
    },
  });

  return NextResponse.json(author, { status: 201 });
}
