import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { orgIdOfUser } from "@/lib/org-owner";
import { orgWhere } from "@/lib/org-scope";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // The acting organization's templates (app-level NULL rows: step 4).
  const templates = await prisma.categoryTemplate.findMany({
    where: await orgWhere(user),
    orderBy: { name: "asc" },
  });

  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { name } = await req.json();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const template = await prisma.categoryTemplate.create({ data: { name, organizationId: await orgIdOfUser(user) } });
  return NextResponse.json(template, { status: 201 });
}
