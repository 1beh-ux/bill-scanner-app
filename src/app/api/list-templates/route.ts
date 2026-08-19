import { NextRequest, NextResponse } from "next/server";
import type { ListTemplateKind } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const ADMIN_KINDS: ListTemplateKind[] = ["med", "situation", "document"];

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") as ListTemplateKind | null;
  if (!kind || !ADMIN_KINDS.includes(kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }

  const items = await prisma.listTemplate.findMany({
    where: { kind },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }

  const body = await req.json();
  const kind: ListTemplateKind | undefined = body.kind;
  const { name, key, sortOrder, data } = body;
  if (!kind || !ADMIN_KINDS.includes(kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  const created = await prisma.listTemplate.create({
    data: {
      kind,
      name: name.trim(),
      key: key || null,
      sortOrder: sortOrder ?? null,
      data: data ?? undefined,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
