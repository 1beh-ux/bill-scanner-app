import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { scanFolders } from "@/lib/drive-cleanup";

export const maxDuration = 300;

// Úklid souborů na Disku: { folders: string[] (links or ids), recursive } -> every file with its
// bills, duplicates and the proposed action. Read-only; runs as the event's Drive connection.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const denied = await requireModuleAccess(user, id, "bills");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const folders: string[] = Array.isArray(body.folders) ? body.folders.filter((x: unknown): x is string => typeof x === "string" && !!x.trim()) : [];
  if (!folders.length) return NextResponse.json({ error: "no_folders" }, { status: 400 });
  return NextResponse.json(await scanFolders({ eventId: id, user, folders, recursive: body.recursive !== false }));
}
