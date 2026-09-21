import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { normalizeName } from "@/lib/payers";

// Find payers from the global pool that are NOT yet attached to this event, so
// one can be attached instead of creating a duplicate. Names only -- bank
// details are revealed only after attaching.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;

  const q = normalizeName(new URL(req.url).searchParams.get("q") ?? "");
  if (q.length < 2) return NextResponse.json([]);

  const candidates = await prisma.author.findMany({
    where: { active: true, mergedIntoAuthorId: null, eventAccess: { none: { eventId } } },
    select: { id: true, canonicalName: true },
    orderBy: { canonicalName: "asc" },
  });
  return NextResponse.json(candidates.filter((a) => normalizeName(a.canonicalName).includes(q)).slice(0, 20));
}
