import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const variables = await prisma.mergeVariable.findMany({
    orderBy: { key: "asc" },
  });

  return NextResponse.json(variables);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { key, sourceType, sourceField, label } = await req.json();
  if (!key || !sourceType || !sourceField || !label) {
    return NextResponse.json({ error: "key, sourceType, sourceField, and label are required" }, { status: 400 });
  }

  const variable = await prisma.mergeVariable.create({ data: { key, sourceType, sourceField, label } });
  return NextResponse.json(variable, { status: 201 });
}
