import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { linkedAccount, requireBank } from "@/lib/bank/guard";
import { claimFioSlot } from "@/lib/bank/check";
import { decryptBankToken } from "@/lib/bank/token-crypto";
import { fetchFioStatement, fioErrorCode, parseFioTransactions } from "@/lib/bank/fio-client";

// "Otestovat připojení": one day from Fio -> the account number and the movement count. Codes only.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; accountId: string }> }) {
  const { id, accountId } = await params;
  const ctx = await requireBank(id);
  if ("error" in ctx) return ctx.error;
  const link = await linkedAccount(id, accountId);
  if (link instanceof NextResponse) return link;
  if (!link.bankAccount.tokenEncrypted) return NextResponse.json({ status: "no_token" });
  if (!(await claimFioSlot(accountId))) return NextResponse.json({ status: "throttled" });
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date(Date.now() - 864e5));
  try {
    const { txs, info } = parseFioTransactions(await fetchFioStatement(decryptBankToken(link.bankAccount.tokenEncrypted), day, day));
    await prisma.bankAccount.update({ where: { id: accountId }, data: { lastSuccessAt: new Date(), lastError: null, ...(info.iban && { iban: info.iban }) } });
    return NextResponse.json({ status: "ok", accountNumber: info.accountId ? `${info.accountId}/${info.bankId ?? ""}` : null, count: txs.length, day });
  } catch (err) {
    const code = err instanceof Error && err.message === "bad_response" ? "bad_response" : fioErrorCode(err);
    await prisma.bankAccount.update({ where: { id: accountId }, data: { lastError: code } });
    return NextResponse.json({ status: code });
  }
}
