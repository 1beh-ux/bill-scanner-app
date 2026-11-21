// POST /api/fields/undo {logId} -- undo one Fields Manager rename (phase 3b): renames back without leaving an alias.
// ponytail: renames only; edits / variables / slots are undone by flipping them back in the UI (their old value is in the log).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyRename } from "@/lib/field-rename";
import { invalidateResolverContext } from "@/lib/field-resolver";
import { fieldsManagerAccess } from "../access";

export async function POST(req: NextRequest) {
  const access = await fieldsManagerAccess();
  if ("error" in access) return access.error;
  const logId = (await req.json().catch(() => null))?.logId;
  const log = typeof logId === "string" ? await prisma.fieldChangeLog.findFirst({ where: { id: logId, organizationId: access.organizationId, action: "rename", undoneAt: null } }) : null;
  if (!log) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const from = (log.after as { key?: string } | null)?.key;
  const to = (log.before as { key?: string } | null)?.key;
  if (!from || !to) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    await applyRename(access.organizationId, access.userId, from, to, { alias: false, logId: log.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 409 });
  }
  invalidateResolverContext();
  return NextResponse.json({ ok: true });
}
