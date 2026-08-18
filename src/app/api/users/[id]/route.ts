import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { displayName, role, active } = body;

  if (active === false && id === user.id) {
    return NextResponse.json({ error: "cannot_deactivate_self" }, { status: 400 });
  }
  if (role !== undefined && role !== "admin" && role !== "accountant" && role !== "user") {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }
  if (role !== undefined && role !== "admin" && id === user.id) {
    return NextResponse.json({ error: "cannot_demote_self" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(displayName !== undefined && { displayName }),
      ...(role !== undefined && { role }),
      ...(active !== undefined && { active }),
    },
  });

  return NextResponse.json(updated);
}