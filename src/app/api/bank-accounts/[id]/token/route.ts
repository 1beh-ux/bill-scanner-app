import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgBankAccount } from "@/lib/org-scope";
import { FIO_TOKEN } from "@/lib/bank/accounts";
import { encryptBankToken } from "@/lib/bank/token-crypto";
import { fetchFioMovements, fioErrorCode } from "@/lib/bank/fio-client";

// Write-only: the token is validated, encrypted and stored, then tried once.
// The response carries a status code only -- never the token.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireOrgBankAccount((await params).id);
  if ("error" in scope) return scope.error;
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!FIO_TOKEN.test(token)) return NextResponse.json({ status: "invalid_format" }, { status: 400 });
  await prisma.bankAccount.update({
    where: { id: scope.accountId },
    data: { tokenEncrypted: encryptBankToken(token), tokenSetAt: new Date(), tokenSetByUserId: scope.user.id, lastError: null, lastCheckedAt: new Date() },
  });
  // One test call (today only); lastCheckedAt above keeps the next real check 35 s away (Fio's 30 s limit).
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());
  try {
    await fetchFioMovements(token, today, today);
    await prisma.bankAccount.update({ where: { id: scope.accountId }, data: { lastSuccessAt: new Date() } });
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    const code = fioErrorCode(err);
    await prisma.bankAccount.update({ where: { id: scope.accountId }, data: { lastError: code } });
    return NextResponse.json({ status: code });
  }
}
