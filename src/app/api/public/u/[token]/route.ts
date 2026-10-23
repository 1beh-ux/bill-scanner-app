import { NextRequest, NextResponse } from "next/server";
import { participantGate, participantPageData, saveParticipantPage } from "@/lib/participant-link";

// The participant's own page (src/lib/participant-link.ts): GET = what it shows, POST { answers } = save.
// Every call carries the typed birth date (x-birth-date); wrong ones are counted (10 an hour).
async function gate(req: NextRequest, token: string) {
  return participantGate(token, req.headers.get("x-birth-date"));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const g = await gate(req, (await params).token);
  if ("status" in g) return NextResponse.json({ error: "gate" }, { status: g.status });
  return NextResponse.json(await participantPageData(g.p));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const g = await gate(req, (await params).token);
  if ("status" in g) return NextResponse.json({ error: "gate" }, { status: g.status });
  const b = (await req.json().catch(() => ({}))) as { answers?: unknown };
  const r = await saveParticipantPage(g.p, b.answers);
  return NextResponse.json(r, { status: "error" in r ? 400 : 200 });
}
