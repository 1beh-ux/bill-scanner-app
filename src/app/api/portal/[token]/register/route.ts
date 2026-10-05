import { NextRequest, NextResponse } from "next/server";
import { portalScope, registerFromPortal, type RegistrationPick } from "@/lib/portal-server";
import { autoAcceptRegistrations } from "@/lib/auto-accept";

// Portal "Přihlásit": { eventId, picks?: [{ memberId, priceCategory?, oddil?, answers?, reviewed? }], note? }
// -> pending participants (src/lib/portal-server.ts). A child link without picks registers its child.
// Missing/invalid answers to the event's required fields (slice 5 #3) = 400 { fields }.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { scope, error } = await portalScope(token, true);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  if (typeof body.eventId !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const picks: RegistrationPick[] = Array.isArray(body.picks)
    ? body.picks.filter((p: unknown): p is RegistrationPick => !!p && typeof (p as RegistrationPick).memberId === "string").slice(0, 20)
    : scope.members.length === 1
      ? [{ memberId: scope.members[0].id }]
      : [];
  const created = await registerFromPortal(scope, body.eventId, picks, typeof body.note === "string" ? body.note : "");
  if ("error" in created) return NextResponse.json(created, { status: created.error === "invalid" ? 400 : 409 });
  const outcome = await autoAcceptRegistrations(body.eventId, created.ids, "portal");
  return NextResponse.json({ ok: true, outcome }, { status: 201 });
}
