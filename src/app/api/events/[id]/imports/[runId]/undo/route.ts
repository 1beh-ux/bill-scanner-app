// Fields Manager phase 4: undo one import run (values changed since are left alone and counted).
import { NextRequest, NextResponse } from "next/server";
import { access } from "../../access";
import { undoImportRun } from "@/lib/import-run";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id: eventId, runId } = await params;
  const a = await access(eventId);
  if ("error" in a) return a.error;
  const result = await undoImportRun(eventId, runId);
  if ("error" in result) return NextResponse.json(result, { status: result.error === "not_found" ? 404 : 409 });
  return NextResponse.json(result);
}
