import { NextRequest, NextResponse } from "next/server";
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
  const categories = await prisma.eventCategory.findMany({
    where: { eventId: id },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(categories);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, description, budgetAmount } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const category = await prisma.eventCategory.create({
    data: {
      eventId: id,
      name,
      description: description ?? null,
      budgetAmount: budgetAmount ?? 0,
      isFromTemplate: false,
    },
  });

  return NextResponse.json(category, { status: 201 });
}
