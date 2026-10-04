import { NextRequest, NextResponse } from "next/server";
import { portalScope, registerFromPortal } from "@/lib/portal-server";

// Portal "Přihlásit": { eventId, memberIds?: string[], note? } -> pending
// participants (src/lib/portal-server.ts). A child link registers its child.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { scope, error } = await portalScope(token, true);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  if (typeof body.eventId !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const memberIds: string[] = Array.isArray(body.memberIds)
    ? body.memberIds.filter((x: unknown): x is string => typeof x === "string")
    : scope.members.length === 1
      ? [scope.members[0].id]
      : [];
  const created = await registerFromPortal(scope, body.eventId, memberIds.map((memberId) => ({ memberId })), typeof body.note === "string" ? body.note : "");
  return created ? NextResponse.json({ ok: true }, { status: 201 }) : NextResponse.json({ error: "not_available" }, { status: 409 });
}
