import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { syncRatesForDate, backfillRates } from "@/lib/exchange-rates";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  try {
    if (body.days) {
      const result = await backfillRates(Number(body.days));
      return NextResponse.json({ ok: true, mode: "backfill", ...result });
    }

    const date = body.date ? new Date(body.date) : undefined;
    const result = await syncRatesForDate(date);

    return NextResponse.json({
      ok: true,
      mode: "single",
      rateDate: result.rateDate.toISOString().slice(0, 10),
      stored: result.stored,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}