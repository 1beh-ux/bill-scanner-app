import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { linkedAccount, requireBank } from "@/lib/bank/guard";
import { cleanMapping } from "@/lib/bank/parse";
import { extractSpreadsheetId } from "@/lib/sheet-import";

type Ctx = { params: Promise<{ id: string; accountId: string }> };
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));

/** { dateFrom, dateTo } the window; { label, sourceType, sheetId, sheetRange, columnMapping } the account. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id, accountId } = await params;
  const ctx = await requireBank(id);
  if ("error" in ctx) return ctx.error;
  const link = await linkedAccount(id, accountId);
  if (link instanceof NextResponse) return link;
  const body = await req.json().catch(() => ({}));
  if (body.dateFrom !== undefined || body.dateTo !== undefined) {
    const from = body.dateFrom ?? link.dateFrom.toISOString().slice(0, 10), to = body.dateTo ?? link.dateTo.toISOString().slice(0, 10);
    if (!isDate(from) || !isDate(to) || from > to) return NextResponse.json({ error: "bad_window" }, { status: 400 });
    await prisma.eventBankAccount.update({ where: { id: link.id }, data: { dateFrom: new Date(from), dateTo: new Date(to) } });
  }
  const data: Record<string, unknown> = {};
  if (typeof body.label === "string" && body.label.trim()) data.label = body.label.trim().slice(0, 100);
  if (["fio_api", "sheet", "file"].includes(body.sourceType)) data.sourceType = body.sourceType;
  if (typeof body.sheetId === "string") data.sheetId = extractSpreadsheetId(body.sheetId) || null;
  if (typeof body.sheetRange === "string") data.sheetRange = body.sheetRange.trim() || null;
  if (Array.isArray(body.columnMapping)) data.columnMapping = cleanMapping(body.columnMapping, body.columnMapping.length);
  if (Object.keys(data).length) await prisma.bankAccount.update({ where: { id: accountId }, data });
  return NextResponse.json({ ok: true });
}

/** Unlinks the account from this event; its transactions here stay. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id, accountId } = await params;
  const ctx = await requireBank(id);
  if ("error" in ctx) return ctx.error;
  const link = await linkedAccount(id, accountId);
  if (link instanceof NextResponse) return link;
  await prisma.eventBankAccount.delete({ where: { id: link.id } });
  return NextResponse.json({ ok: true });
}
