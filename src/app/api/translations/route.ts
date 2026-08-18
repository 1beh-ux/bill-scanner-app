import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const translations = await prisma.translation.findMany({
    orderBy: { key: "asc" },
  });

  return NextResponse.json(translations);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { key, cs, en } = await req.json();
  if (!key || !cs || !en) {
    return NextResponse.json({ error: "key, cs, and en are required" }, { status: 400 });
  }

  const translation = await prisma.translation.create({ data: { key, cs, en } });
  return NextResponse.json(translation, { status: 201 });
}
