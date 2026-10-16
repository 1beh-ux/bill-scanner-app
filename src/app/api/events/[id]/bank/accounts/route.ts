import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBank } from "@/lib/bank/guard";
import { ymd } from "@/lib/bank/import";

type Ctx = { params: Promise<{ id: string }> };
// Never the token: only whether one is saved.
const publicAccount = (a: { id: string; label: string; accountNumber: string; bankCode: string; iban: string | null; currency: string; sourceType: string; tokenEncrypted: string | null; tokenSetAt: Date | null; sheetId: string | null; sheetRange: string | null; columnMapping: unknown; lastSyncAt: Date | null; lastSyncResult: unknown; lastError: string | null }) => ({
  id: a.id, label: a.label, accountNumber: a.accountNumber, bankCode: a.bankCode, iban: a.iban, currency: a.currency, sourceType: a.sourceType,
  tokenSaved: !!a.tokenEncrypted, tokenSetAt: a.tokenSetAt, sheetId: a.sheetId, sheetRange: a.sheetRange, columnMapping: a.columnMapping,
  lastSyncAt: a.lastSyncAt, lastSyncResult: a.lastSyncResult, lastError: a.lastError,
});

/** Linked accounts (with window) + the organization's other accounts to link. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireBank((await params).id);
  if ("error" in ctx) return ctx.error;
  const [links, all] = await Promise.all([
    prisma.eventBankAccount.findMany({ where: { eventId: ctx.event.id }, include: { bankAccount: true }, orderBy: { createdAt: "asc" } }),
    prisma.bankAccount.findMany({ where: { organizationId: ctx.event.organizationId, active: true }, select: { id: true, label: true, accountNumber: true, bankCode: true }, orderBy: { label: "asc" } }),
  ]);
  const linked = new Set(links.map((l) => l.bankAccountId));
  return NextResponse.json({
    links: links.map((l) => ({ dateFrom: ymd(l.dateFrom), dateTo: ymd(l.dateTo), account: publicAccount(l.bankAccount) })),
    available: all.filter((a) => !linked.has(a.id)),
    eventDates: { from: ymd(ctx.event.startDate), to: ymd(ctx.event.endDate) },
  });
}

/** { bankAccountId } links an existing organization account; { label, accountNumber, bankCode, sourceType } creates one. Window = the event's dates. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = await requireBank((await params).id);
  if ("error" in ctx) return ctx.error;
  if (ctx.event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  let accountId: string;
  if (typeof body.bankAccountId === "string") {
    const a = await prisma.bankAccount.findFirst({ where: { id: body.bankAccountId, organizationId: ctx.event.organizationId }, select: { id: true } });
    if (!a) return NextResponse.json({ error: "not_found" }, { status: 404 });
    accountId = a.id;
  } else {
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 100) : "";
    const accountNumber = typeof body.accountNumber === "string" ? body.accountNumber.replace(/\s/g, "") : "";
    const bankCode = typeof body.bankCode === "string" ? body.bankCode.trim() : "";
    const sourceType = ["fio_api", "sheet", "file"].includes(body.sourceType) ? body.sourceType : null;
    if (!label || !/^(\d{1,6}-)?\d{2,10}$/.test(accountNumber) || !/^\d{4}$/.test(bankCode) || !sourceType) return NextResponse.json({ error: "invalid" }, { status: 400 });
    if (sourceType === "fio_api" && bankCode !== "2010") return NextResponse.json({ error: "fio_bank_code" }, { status: 400 });
    const existing = await prisma.bankAccount.findFirst({ where: { organizationId: ctx.event.organizationId, accountNumber, bankCode }, select: { id: true } });
    if (existing) return NextResponse.json({ error: "exists" }, { status: 409 });
    accountId = (await prisma.bankAccount.create({ data: { organizationId: ctx.event.organizationId, label, accountNumber, bankCode, sourceType, createdById: ctx.user.id } })).id;
  }
  await prisma.eventBankAccount.upsert({
    where: { eventId_bankAccountId: { eventId: ctx.event.id, bankAccountId: accountId } },
    create: { eventId: ctx.event.id, bankAccountId: accountId, dateFrom: ctx.event.startDate, dateTo: ctx.event.endDate },
    update: {},
  });
  return NextResponse.json({ id: accountId }, { status: 201 });
}
