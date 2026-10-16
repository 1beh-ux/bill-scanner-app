import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBank } from "@/lib/bank/guard";

// An import's per-row result (Banka -> Účty a import -> result table).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; batchId: string }> }) {
  const { id, batchId } = await params;
  const ctx = await requireBank(id);
  if ("error" in ctx) return ctx.error;
  const batch = await prisma.bankImportBatch.findFirst({ where: { id: batchId, eventId: id }, include: { bankAccount: { select: { label: true } } } });
  if (!batch) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ id: batch.id, source: batch.source, fileName: batch.fileName, account: batch.bankAccount.label, counts: batch.counts, rows: batch.rows, createdAt: batch.createdAt });
}
