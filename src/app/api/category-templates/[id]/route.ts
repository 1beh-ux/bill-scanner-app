import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "@/lib/org-scope";
import { templateScope } from "@/lib/template-scope";

// One category template of the acting organization (or ?level=app: an app template, super-admin).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const scope = await templateScope(req, user, true);
  if ("error" in scope) return scope.error;

  const { id } = await params;
  // Another organization's (or level's) template doesn't exist here.
  if (!(await prisma.categoryTemplate.count({ where: { id, organizationId: scope.organizationId } }))) return notFound();
  const { name, description } = await req.json();

  const template = await prisma.categoryTemplate.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
    },
  });

  return NextResponse.json(template);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const scope = await templateScope(req, user, true);
  if ("error" in scope) return scope.error;

  const { id } = await params;
  if (!(await prisma.categoryTemplate.count({ where: { id, organizationId: scope.organizationId } }))) return notFound();
  await prisma.categoryTemplate.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
