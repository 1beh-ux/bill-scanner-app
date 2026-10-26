import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isOrgAdmin } from "@/lib/org-scope";
import { readExportColumns } from "@/lib/export-columns";

// Šablony -> Účastníci: the organization's default columns of the participant export (admins).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const o = await prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { exportColumns: true } });
  return NextResponse.json({ keys: readExportColumns(o.exportColumns) });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isOrgAdmin(user)) return NextResponse.json({ error: "admin_only" }, { status: 403 });
  const keys = readExportColumns((await req.json().catch(() => ({}))).keys);
  await prisma.organization.update({ where: { id: user.organizationId }, data: { exportColumns: keys ?? Prisma.DbNull } });
  return NextResponse.json({ keys });
}
