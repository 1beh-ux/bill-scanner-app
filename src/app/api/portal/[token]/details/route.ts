import { NextRequest, NextResponse } from "next/server";
import { portalScope, saveRegistrationDetails } from "@/lib/portal-server";

// Portal registration card -> "Doplňte údaje" (two-step events, after acceptance): { participantId, answers }.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { scope, error } = await portalScope(token, true);
  if (error) return error;
  const b = (await req.json().catch(() => ({}))) as { participantId?: unknown; answers?: unknown };
  const r = await saveRegistrationDetails(scope, b.participantId, b.answers);
  if ("error" in r) return NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 });
  return NextResponse.json(r);
}
