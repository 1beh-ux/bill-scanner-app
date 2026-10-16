import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { linkedAccount, requireBank } from "@/lib/bank/guard";
import { FIO_TOKEN } from "@/lib/bank/accounts";
import { encryptBankToken } from "@/lib/bank/token-crypto";

// Write-only Fio token (same rules as the payment check: never logged, never returned).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; accountId: string }> }) {
  const { id, accountId } = await params;
  const ctx = await requireBank(id);
  if ("error" in ctx) return ctx.error;
  const link = await linkedAccount(id, accountId);
  if (link instanceof NextResponse) return link;
  if (link.bankAccount.bankCode !== "2010") return NextResponse.json({ status: "not_fio" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!FIO_TOKEN.test(token)) return NextResponse.json({ status: "invalid_format" }, { status: 400 });
  await prisma.bankAccount.update({
    where: { id: accountId },
    data: { tokenEncrypted: encryptBankToken(token), tokenSetAt: new Date(), tokenSetByUserId: ctx.user.id, lastError: null, sourceType: "fio_api" },
  });
  return NextResponse.json({ status: "saved" });
}
