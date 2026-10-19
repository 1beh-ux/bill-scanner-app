import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { normalizeTicketCode } from "@/lib/tickets";
import { doorCounts, scanTicket } from "@/lib/tickets-server";

// The door check-in for people with the Vstupenky module (the no-login variant: /api/public/scan).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const denied = await requireModuleAccess(user, id, "tickets");
  if (denied) return denied;
  return NextResponse.json(await doorCounts(id), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const denied = await requireModuleAccess(user, id, "tickets");
  if (denied) return denied;
  const { code } = (await req.json().catch(() => ({}))) as { code?: unknown };
  const result = await scanTicket(id, normalizeTicketCode(code), user.id);
  return NextResponse.json({ result, counts: await doorCounts(id) });
}
