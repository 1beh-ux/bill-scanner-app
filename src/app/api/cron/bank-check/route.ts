import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkBankAccount } from "@/lib/bank/check";
import { accountDue } from "@/lib/bank/check-schedule";

export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.headers.get("x-cron-secret") === expected;
}

// Every minute (Cloud Scheduler job bank-check): each active account with a token and an active event
// using it, when due by its events' own interval (src/lib/bank/check-schedule.ts). checkBankAccount
// logs its own one-line summary (never the token or URL); a check with nothing unpaid never calls Fio.
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const accounts = await prisma.bankAccount.findMany({
    where: { active: true, tokenEncrypted: { not: null }, events: { some: { bankCheckEnabled: true, status: "active" } } },
    select: { id: true, lastCheckedAt: true, events: { where: { bankCheckEnabled: true, status: "active" }, select: { bankCheckIntervalMin: true } } },
  });
  const now = new Date();
  const due = accounts.filter((a) => accountDue(a.lastCheckedAt, a.events.map((e) => e.bankCheckIntervalMin), now));
  const results: Record<string, unknown> = {};
  for (const a of due) results[a.id] = await checkBankAccount(a.id, { reason: "cron" });
  return NextResponse.json({ ok: true, accounts: accounts.length, checked: due.length, results });
}
