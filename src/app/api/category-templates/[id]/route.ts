import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notFound, orgWhere } from "@/lib/org-scope";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  // Another organization's template doesn't exist here.
  if (!(await prisma.categoryTemplate.count({ where: { id, ...(await orgWhere(user)) } }))) return notFound();
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

  const { id } = await params;
  // Another organization's template doesn't exist here.
  if (!(await prisma.categoryTemplate.count({ where: { id, ...(await orgWhere(user)) } }))) return notFound();
  await prisma.categoryTemplate.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
