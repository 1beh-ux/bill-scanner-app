import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgAdminEvent } from "@/lib/org-scope";
import { linkChildren } from "@/lib/children";

// Účastníci -> picked -> "Nabídnout portál" (admin only): the picked participants not in Členové yet become
// people there (an "existing people only" event never creates them on its own), then the admin sends them
// the portal invitation from the usual compose page. Returns the people of all picked participants.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireOrgAdminEvent(id);
  if ("error" in access) return access.error;
  const { participantIds } = await req.json().catch(() => ({}));
  if (!Array.isArray(participantIds) || participantIds.length === 0 || participantIds.length > 500 || !participantIds.every((x) => typeof x === "string")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const where = { eventId: id, id: { in: participantIds as string[] } };
  const { created } = await linkChildren(where, { createMissing: true });
  const rows = await prisma.participant.findMany({ where: { ...where, childId: { not: null } }, select: { childId: true } });
  // Without a birth date (or in an event unlinked from Členové) a participant can't become a person.
  return NextResponse.json({ childIds: [...new Set(rows.map((r) => r.childId!))], created, skipped: participantIds.length - rows.length });
}
