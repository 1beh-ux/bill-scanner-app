import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { orgIdOfUser } from "@/lib/org-owner";
import { isOrgAdmin } from "@/lib/org-scope";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isOrgAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const users = await prisma.user.findMany({ orderBy: { displayName: "asc" } });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isOrgAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { email, displayName, role } = body;
  if (!email || !displayName || !role) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (role !== "admin" && role !== "accountant" && role !== "user") {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }

  try {
    const created = await prisma.user.create({
      data: { email: email.trim().toLowerCase(), displayName: displayName.trim(), role, organizationId: await orgIdOfUser(user) },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "duplicate_email" }, { status: 409 });
    }
    throw err;
  }
}