import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { key } = await params;
  const body = await req.json();
  const { sourceType, sourceField, label, active } = body;

  const variable = await prisma.mergeVariable.update({
    where: { key: decodeURIComponent(key) },
    data: {
      ...(sourceType !== undefined && { sourceType }),
      ...(sourceField !== undefined && { sourceField }),
      ...(label !== undefined && { label }),
      ...(active !== undefined && { active }),
    },
  });

  return NextResponse.json(variable);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { key } = await params;
  await prisma.mergeVariable.delete({ where: { key: decodeURIComponent(key) } });

  return NextResponse.json({ ok: true });
}
