import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { ensureLink, linkPath, reissueLink } from "@/lib/settlement-links";

// Vyúčtování links (src/lib/settlement-links.ts) on Platby: POST { authorIds: [...] } creates the missing ones
// (only payers attached to the event or with something in it), { authorId, reissue: true } gives a new link (the
// old one stops working). Returns [{ authorId, path }].
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as { authorIds?: unknown; authorId?: unknown; reissue?: unknown };
  const ids = [...new Set((Array.isArray(b.authorIds) ? b.authorIds : [b.authorId]).filter((x): x is string => typeof x === "string"))].slice(0, 500);
  if (!ids.length) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true, organizationId: true } });
  // People of this event: attached payers, or anyone with a bill / personal part here.
  const ok = await prisma.author.findMany({
    where: {
      id: { in: ids },
      organizationId: event.organizationId,
      OR: [{ eventAccess: { some: { eventId } } }, { bills: { some: { eventId } } }, { personalShares: { some: { personalBill: { eventId } } } }],
    },
    select: { id: true },
  });
  if (ok.length !== ids.length) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const out = [];
  for (const authorId of ids) {
    const link = b.reissue === true ? await reissueLink(eventId, authorId) : await ensureLink(eventId, authorId);
    out.push({ authorId, path: linkPath(event.name, link.token) });
  }
  return NextResponse.json(out);
}
