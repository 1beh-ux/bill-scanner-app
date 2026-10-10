import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/org-scope";

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
  // Super-admin only (organizations step 2).
  const notSuperAdmin = requireSuperAdmin(user);
  if (notSuperAdmin) return notSuperAdmin;

  const { key, cs, en } = await req.json();
  if (!key || !cs || !en) {
    return NextResponse.json({ error: "key, cs, and en are required" }, { status: 400 });
  }

  const translation = await prisma.translation.create({ data: { key, cs, en } });
  return NextResponse.json(translation, { status: 201 });
}
