import { NextRequest, NextResponse } from "next/server";
import { cancelPaidParts, personalGuard } from "@/lib/personal-bills-server";

// "Zrušit platbu": POST { authorId, note } -- the person's paid parts of this bill are open again; the reason is
// mandatory and kept in Historie plateb.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; billId: string }> }) {
  const { id, billId } = await params;
  const g = await personalGuard(id);
  if ("error" in g) return g.error;
  if (g.event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  const b = (await req.json().catch(() => ({}))) as { authorId?: unknown; note?: unknown };
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 1000) : "";
  if (typeof b.authorId !== "string" || note.length < 3) return NextResponse.json({ error: "note_required" }, { status: 400 });
  const r = await cancelPaidParts(id, billId, b.authorId, g.user.id, note);
  return "error" in r ? NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 }) : NextResponse.json(r);
}
