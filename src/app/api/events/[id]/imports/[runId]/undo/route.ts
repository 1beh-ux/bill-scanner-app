// Fields Manager phase 4: undo one import run (values changed since are left alone and counted).
import { NextRequest, NextResponse } from "next/server";
import { fieldsManagerAccess } from "@/app/api/fields/access";
import { prisma } from "@/lib/prisma";
import { undoImportRun } from "@/lib/import-run";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id: eventId, runId } = await params;
  const a = await fieldsManagerAccess();
  if ("error" in a) return a.error;
  if (!(await prisma.event.findFirst({ where: { id: eventId, organizationId: a.organizationId }, select: { id: true } }))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const result = await undoImportRun(eventId, runId);
  if ("error" in result) return NextResponse.json(result, { status: result.error === "not_found" ? 404 : 409 });
  return NextResponse.json(result);
}
