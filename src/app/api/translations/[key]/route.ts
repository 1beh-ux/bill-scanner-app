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
  const { cs, en } = body;

  const translation = await prisma.translation.update({
    where: { key: decodeURIComponent(key) },
    data: {
      ...(cs !== undefined && { cs }),
      ...(en !== undefined && { en }),
    },
  });

  return NextResponse.json(translation);
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
  await prisma.translation.delete({ where: { key: decodeURIComponent(key) } });

  return NextResponse.json({ ok: true });
}
