import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkBankAccount } from "@/lib/bank/check";

export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.headers.get("x-cron-secret") === expected;
}

// Every 30 minutes (Cloud Scheduler job bank-check): each active account with a token and an
// event using it. checkBankAccount logs its own one-line summary (never the token or URL).
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const accounts = await prisma.bankAccount.findMany({
    where: { active: true, tokenEncrypted: { not: null }, events: { some: { bankCheckEnabled: true } } },
    select: { id: true },
  });
  const results: Record<string, unknown> = {};
  for (const a of accounts) results[a.id] = await checkBankAccount(a.id, { reason: "cron" });
  return NextResponse.json({ ok: true, accounts: accounts.length, results });
}
