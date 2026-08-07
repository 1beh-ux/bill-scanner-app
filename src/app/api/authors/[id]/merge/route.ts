import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: sourceId } = await params;
  const body = await req.json().catch(() => ({}));
  const targetId: string | undefined = body.targetAuthorId;

  if (!targetId) {
    return NextResponse.json({ error: "targetAuthorId is required" }, { status: 400 });
  }
  if (targetId === sourceId) {
    return NextResponse.json({ error: "cannot_merge_self" }, { status: 400 });
  }

  const [source, target] = await Promise.all([
    prisma.author.findUnique({ where: { id: sourceId } }),
    prisma.author.findUnique({ where: { id: targetId } }),
  ]);

  if (!source) return NextResponse.json({ error: "source_not_found" }, { status: 404 });
  if (!target) return NextResponse.json({ error: "target_not_found" }, { status: 404 });
  if (!source.active) return NextResponse.json({ error: "already_merged" }, { status: 400 });
  if (!target.active) return NextResponse.json({ error: "target_inactive" }, { status: 400 });

  await prisma.$transaction(async (tx) => {
    // Move all of the source's bills to the target — not scoped or blocked
    // by any individual event's closed status; see conversation note.
    await tx.bill.updateMany({
      where: { payerAuthorId: sourceId },
      data: { payerAuthorId: targetId },
    });

    // Copy event access the source had, skipping events the target already
    // has access to (the composite primary key would otherwise conflict).
    const sourceAccess = await tx.authorEventAccess.findMany({ where: { authorId: sourceId } });
    const targetAccess = await tx.authorEventAccess.findMany({ where: { authorId: targetId } });
    const targetEventIds = new Set(targetAccess.map((a) => a.eventId));

    const toCopy = sourceAccess.filter((a) => !targetEventIds.has(a.eventId));
    if (toCopy.length > 0) {
      await tx.authorEventAccess.createMany({
        data: toCopy.map((a) => ({ authorId: targetId, eventId: a.eventId })),
      });
    }
    await tx.authorEventAccess.deleteMany({ where: { authorId: sourceId } });

    // Archive the source — reuses the schema's existing merge fields.
    await tx.author.update({
      where: { id: sourceId },
      data: { active: false, mergedIntoAuthorId: targetId },
    });
  });

  return NextResponse.json({ ok: true });
}