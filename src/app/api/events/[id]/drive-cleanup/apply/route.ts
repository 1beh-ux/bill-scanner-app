import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { applyCleanup, type CleanupAction } from "@/lib/drive-cleanup";
import { parseFolderId } from "@/lib/drive-errors";

export const maxDuration = 300;
const MAX = 300;

// Úklid souborů na Disku: move the chosen files to the target folder, or move duplicates to the
// Drive bin (restorable 30 days). { actions: [{ fileId, folderId, action }], targetFolder }.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const denied = await requireModuleAccess(user, id, "bills");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const ok = (a: unknown): a is CleanupAction => {
    const x = a as CleanupAction;
    return !!x && typeof x.fileId === "string" && /^[\w-]{10,100}$/.test(x.fileId) && typeof x.folderId === "string" && /^[\w-]{10,100}$/.test(x.folderId) && (x.action === "move" || x.action === "trash");
  };
  const actions: CleanupAction[] = Array.isArray(body.actions) ? body.actions.filter(ok).slice(0, MAX) : [];
  if (!actions.length) return NextResponse.json({ error: "nothing_selected" }, { status: 400 });
  const target = typeof body.targetFolder === "string" && body.targetFolder.trim() ? parseFolderId(body.targetFolder) : null;
  if (actions.some((a) => a.action === "move") && !target) return NextResponse.json({ error: "no_target" }, { status: 400 });
  return NextResponse.json({ results: await applyCleanup({ eventId: id, actions, targetFolderId: target }) });
}
