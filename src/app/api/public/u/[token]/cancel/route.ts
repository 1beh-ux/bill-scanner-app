import { NextRequest, NextResponse } from "next/server";
import { participantScope } from "@/lib/participant-link";
import { deleteParticipantCascade } from "@/lib/participant-delete";

// "Zrušit přihlášku" on the participant's page: only while PENDING (the portal's rule). { participantId }
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { p, error } = await participantScope((await params).token, true);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  if (body.participantId !== p.id || p.registrationStatus !== "pending") return NextResponse.json({ error: "not_found" }, { status: 404 });
  await deleteParticipantCascade(p.id);
  return NextResponse.json({ ok: true });
}
