import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Full bank-detail change history of one payer -- admin only.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "admin_only" }, { status: 403 });

  const { id } = await params;
  const rows = await prisma.authorBankAudit.findMany({
    where: { authorId: id },
    orderBy: { createdAt: "desc" },
    include: { changedByUser: { select: { displayName: true } }, event: { select: { name: true } } },
  });
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      at: r.createdAt,
      byName: r.changedByUser.displayName,
      eventName: r.event?.name ?? null,
      source: r.source,
      old: { account: r.oldBankAccountNumber, code: r.oldBankCode },
      new: { account: r.newBankAccountNumber, code: r.newBankCode },
    }))
  );
}
