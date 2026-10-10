import { NextRequest, NextResponse } from "next/server";
import type { ListTemplateKind } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PLAN_ORG_LIST_KINDS } from "@/lib/planning";
import { templateScope } from "@/lib/template-scope";

const ADMIN_KINDS: ListTemplateKind[] = ["med", "situation", "document", ...PLAN_ORG_LIST_KINDS];

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const scope = await templateScope(req, user, false);
  if ("error" in scope) return scope.error;
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") as ListTemplateKind | null;
  if (!kind || !ADMIN_KINDS.includes(kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }

  const items = await prisma.listTemplate.findMany({
    // The acting organization's templates.
    where: { kind, organizationId: scope.organizationId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // Writes: the organization's admin (?level=app: an app template, super-admin).
  const scope = await templateScope(req, user, true);
  if ("error" in scope) return scope.error;

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
      organizationId: scope.organizationId,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
