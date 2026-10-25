import { NextResponse } from "next/server";
import { participantPageData, participantScope } from "@/lib/participant-link";

// The participant's own page (src/lib/participant-link.ts): its registration card, as in the parent portal.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { p, error } = await participantScope((await params).token, true);
  if (error) return error;
  return NextResponse.json(await participantPageData(p), { headers: { "Cache-Control": "no-store" } });
}
