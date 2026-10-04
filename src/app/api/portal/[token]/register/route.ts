import { NextRequest, NextResponse } from "next/server";
import { portalChild, registerFromPortal } from "@/lib/portal-server";

// Portal "Přihlásit": { eventId, note? } -> a pending participant (src/lib/portal-server.ts).
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { child, error } = await portalChild(token, true);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  if (typeof body.eventId !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const created = await registerFromPortal(child, body.eventId, typeof body.note === "string" ? body.note : "");
  return created ? NextResponse.json({ ok: true }, { status: 201 }) : NextResponse.json({ error: "not_available" }, { status: 409 });
}
