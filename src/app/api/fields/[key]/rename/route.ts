// GET  /api/fields/<key>/rename?to=<new>  -- what the rename would touch (counts; shown before confirming)
// POST /api/fields/<key>/rename {to, confirm} -- the rename (src/lib/field-rename.ts); confirm must repeat `to`.
import { NextRequest, NextResponse } from "next/server";
import { applyRename, renamePreview } from "@/lib/field-rename";
import { invalidateResolverContext } from "@/lib/field-resolver";
import { fieldsManagerAccess } from "../../access";

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const access = await fieldsManagerAccess();
  if ("error" in access) return access.error;
  const { key } = await params;
  return NextResponse.json(await renamePreview(access.organizationId, key, (req.nextUrl.searchParams.get("to") ?? "").trim()));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const access = await fieldsManagerAccess();
  if ("error" in access) return access.error;
  const { key } = await params;
  const body = (await req.json().catch(() => null)) as { to?: unknown; confirm?: unknown } | null;
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  if (!to || body?.confirm !== to) return NextResponse.json({ error: "confirm_mismatch" }, { status: 400 });
  try {
    const log = await applyRename(access.organizationId, access.userId, key, to);
    invalidateResolverContext();
    return NextResponse.json({ ok: true, logId: log.id });
  } catch (err) {
    const code = err instanceof Error ? err.message : "failed";
    return NextResponse.json({ error: code }, { status: ["invalid_key", "same_key", "key_taken", "fixed_field"].includes(code) ? 400 : code === "not_found" ? 404 : 500 });
  }
}
