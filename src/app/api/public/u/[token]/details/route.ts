import { NextRequest, NextResponse } from "next/server";
import { participantScope, saveParticipantPage } from "@/lib/participant-link";

// The card's "Doplňte údaje": { participantId, answers } (participantId must be this page's).
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { p, error } = await participantScope((await params).token, true);
  if (error) return error;
  const b = (await req.json().catch(() => ({}))) as { participantId?: unknown; answers?: unknown };
  if (b.participantId !== p.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const r = await saveParticipantPage(p, b.answers);
  return NextResponse.json(r, { status: "error" in r ? 400 : 200 });
}
