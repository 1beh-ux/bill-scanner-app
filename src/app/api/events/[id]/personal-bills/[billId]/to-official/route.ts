import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import type { IngestChannel } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { personalGuard } from "@/lib/personal-bills-server";

// "Přesunout do oficiálních": the personal bill becomes an official bill of the event again (status Nová, to be
// categorised and approved as any other); its shares go. Not once a share is settled.
type FromBill = { originalFilename?: string; displayFilename?: string | null; contentHash?: string; ingestChannel?: IngestChannel; driveSourceFileId?: string | null; originalGcsObjectPath?: string | null; notes?: string | null; createdByUserId?: string };

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; billId: string }> }) {
  const { id, billId } = await params;
  const g = await personalGuard(id);
  if ("error" in g) return g.error;
  if (g.event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  const p = await prisma.personalBill.findFirst({ where: { id: billId, eventId: id }, include: { shares: { select: { settledAt: true, creditorPaidAt: true } } } });
  if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (p.shares.some((s) => s.settledAt || s.creditorPaidAt)) return NextResponse.json({ error: "settled_locked" }, { status: 409 });
  const from = (p.fromBill ?? {}) as FromBill;
  let contentHash = from.contentHash ?? crypto.createHash("sha256").update(`personal:${p.id}`).digest("hex");
  // The same document may have been uploaded again meanwhile (unique per event): keep both, distinguishable.
  if (await prisma.bill.findFirst({ where: { eventId: id, contentHash }, select: { id: true } })) contentHash = crypto.createHash("sha256").update(`${contentHash}:${p.id}`).digest("hex");
  const bill = await prisma.$transaction(async (tx) => {
    const created = await tx.bill.create({
      data: {
        eventId: id,
        gcsObjectPath: p.gcsObjectPath,
        originalGcsObjectPath: from.originalGcsObjectPath ?? null,
        sizeBytes: p.sizeBytes,
        originalFilename: from.originalFilename ?? p.originalFilename ?? `${p.merchantName ?? "uctenka"}.txt`,
        displayFilename: from.displayFilename ?? null,
        driveSourceFileId: from.driveSourceFileId ?? null,
        contentHash,
        ingestChannel: from.ingestChannel ?? "upload",
        documentMissing: !p.gcsObjectPath,
        merchantName: p.merchantName,
        billDate: p.billDate,
        totalAmount: p.totalAmount,
        currency: p.currency,
        amountCzk: p.amountCzk,
        exchangeRateUsed: p.exchangeRateUsed,
        exchangeRateDate: p.exchangeRateUsed ? p.billDate : null,
        payerAuthorId: p.authorId,
        notes: [from.notes, p.note].filter(Boolean).join("\n") || null,
        status: "new",
        createdByUserId: from.createdByUserId ?? g.user.id,
      },
      select: { id: true },
    });
    await tx.personalBill.delete({ where: { id: p.id } });
    return created;
  });
  return NextResponse.json(bill);
}
