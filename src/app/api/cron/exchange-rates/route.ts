import { NextRequest, NextResponse } from "next/server";
import { syncRatesForDate, backfillRates } from "@/lib/exchange-rates";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.headers.get("x-cron-secret") === expected;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const daysParam = req.nextUrl.searchParams.get("days");

  try {
    if (daysParam) {
      const result = await backfillRates(Number(daysParam));
      return NextResponse.json({ ok: true, mode: "backfill", ...result });
    }

    // Usage metrics retention: page views are kept 12 months (content/help/pristup.md).
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);
    await prisma.userActivity.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch((err) => console.log("[cron] activity retention failed:", String(err)));

    const result = await syncRatesForDate();
    return NextResponse.json({
      ok: true,
      mode: "daily",
      rateDate: result.rateDate.toISOString().slice(0, 10),
      stored: result.stored,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}