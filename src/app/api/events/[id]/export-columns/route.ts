import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { readExportColumns } from "@/lib/export-columns";

// The participant export's columns of this event (src/lib/export-columns.ts). GET = its own + the organization's;
// PUT { keys } = its own (null / [] = back to the organization's).
async function guard(eventId: string) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return requireAnyModuleAccess(user, eventId, ["participants", "health", "mail"]);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guard(id);
  if (denied) return denied;
  const e = await prisma.event.findUniqueOrThrow({ where: { id }, select: { exportColumns: true, organization: { select: { exportColumns: true } } } });
  return NextResponse.json({ own: readExportColumns(e.exportColumns), org: readExportColumns(e.organization.exportColumns) });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guard(id);
  if (denied) return denied;
  const keys = readExportColumns((await req.json().catch(() => ({}))).keys);
  await prisma.event.update({ where: { id }, data: { exportColumns: keys ?? Prisma.DbNull } });
  return NextResponse.json({ own: keys });
}
