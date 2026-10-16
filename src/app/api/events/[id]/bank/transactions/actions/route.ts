import { NextRequest, NextResponse } from "next/server";
import type { BankClassification, BankIncomeType } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { requireBank, hasBankAccess } from "@/lib/bank/guard";
import { confirmSuggestions, previewConfirm, rejectSuggestions } from "@/lib/bank/pairing";
import { runSuggestions } from "@/lib/bank/suggest";
import { createBillsFromTransactions } from "@/lib/bank/bill-from-tx";

const CLASSES: BankClassification[] = ["expense", "income", "cash", "transfer", "fee", "private", "other_event"];
const INCOME: BankIncomeType[] = ["fee", "grant", "donation", "refund", "other"];
const NO_DOC: BankClassification[] = ["cash", "transfer", "fee", "private", "other_event", "income"];

/**
 * Banka -> Pohyby actions on rows of this event: classify, noDoc, note, confirmPreview, confirm,
 * reject, move, createBills, suggest. Body: { action, ids?, sure?, ... }.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireBank(id);
  if ("error" in ctx) return ctx.error;
  if (ctx.event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  const requested: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown): x is string => typeof x === "string").slice(0, 2000) : [];
  // Only this event's rows, whatever the body says.
  const ids = requested.length ? (await prisma.bankTransaction.findMany({ where: { id: { in: requested }, eventId: id }, select: { id: true } })).map((r) => r.id) : [];
  const userId = ctx.user.id;

  switch (body.action) {
    case "classify": {
      if (!CLASSES.includes(body.classification)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
      const cls = body.classification as BankClassification;
      const person = cls === "private" && typeof body.personAuthorId === "string" ? body.personAuthorId : null;
      if (person && !(await prisma.author.count({ where: { id: person, organizationId: ctx.event.organizationId } }))) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const r = await prisma.bankTransaction.updateMany({
        where: { id: { in: ids } },
        data: {
          classification: cls,
          classifiedByUser: true,
          incomeType: cls === "income" ? (INCOME.includes(body.incomeType) ? body.incomeType : "other") : null,
          ...(cls === "private" ? { personAuthorId: person } : { personAuthorId: null }),
          ...(NO_DOC.includes(cls) ? { noDocumentNeeded: true } : {}),
        },
      });
      // Not an expense any more: its open suggestions go.
      if (cls !== "expense") await prisma.bankMatch.deleteMany({ where: { transactionId: { in: ids }, confirmedAt: null, rejectedAt: null } });
      return NextResponse.json({ updated: r.count });
    }
    case "noDoc": {
      const r = await prisma.bankTransaction.updateMany({ where: { id: { in: ids } }, data: { noDocumentNeeded: body.value !== false, classifiedByUser: true } });
      return NextResponse.json({ updated: r.count });
    }
    case "note": {
      const r = await prisma.bankTransaction.updateMany({ where: { id: { in: ids } }, data: { userNote: typeof body.userNote === "string" ? body.userNote.slice(0, 500) || null : null } });
      return NextResponse.json({ updated: r.count });
    }
    case "confirmPreview":
      return NextResponse.json(await previewConfirm({ eventId: id, transactionIds: body.sure ? undefined : ids, onlySure: !!body.sure }));
    case "confirm":
      return NextResponse.json(await confirmSuggestions({ eventId: id, userId, transactionIds: body.sure ? undefined : ids, onlySure: !!body.sure }));
    case "reject":
      return NextResponse.json(await rejectSuggestions({ eventId: id, userId, transactionIds: ids, matchIds: Array.isArray(body.matchIds) ? body.matchIds : undefined }));
    case "suggest":
      return NextResponse.json(await runSuggestions(id));
    case "move": {
      const target = typeof body.targetEventId === "string" ? body.targetEventId : "";
      if (!target || target === id) return NextResponse.json({ error: "bad_request" }, { status: 400 });
      if (!(await hasBankAccess(ctx.user, target))) return NextResponse.json({ error: "module_access_denied" }, { status: 403 });
      // Paired rows stay (their bills are here); moving drops open suggestions.
      const movable = (await prisma.bankTransaction.findMany({ where: { id: { in: ids }, matches: { none: { confirmedAt: { not: null } } } }, select: { id: true } })).map((r) => r.id);
      await prisma.$transaction([
        prisma.bankMatch.deleteMany({ where: { transactionId: { in: movable }, confirmedAt: null } }),
        prisma.bankTransaction.updateMany({ where: { id: { in: movable } }, data: { eventId: target, importBatchId: null } }),
      ]);
      return NextResponse.json({ moved: movable.length, skipped: ids.length - movable.length });
    }
    case "createBills":
      return NextResponse.json(await createBillsFromTransactions({ eventId: id, transactionIds: ids, userId, fromStatement: !!body.fromStatement }));
    default:
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}
