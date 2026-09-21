import { NextRequest, NextResponse } from "next/server";
import type { Currency } from "@/generated/prisma";
import { getCurrentUser } from "@/lib/auth";
import { convertToCzk } from "@/lib/exchange-rates";

// The rate a bill of `currency` dated `date` gets -- for the live "≈ X Kč"
// preview on the bill form. It is exactly convertToCzk() with a unit amount,
// i.e. the same function (same stored/fetched ČNB rate, same weekend/holiday
// fallback to the previous published day) that saving a bill uses, so the
// preview, the saved value and the list can never disagree. Any past date
// works: a missing rate is fetched from ČNB on demand and stored.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const currency = params.get("currency");
  const dateText = params.get("date") ?? "";
  if (currency !== "EUR" && currency !== "PLN") return NextResponse.json({ error: "invalid_currency" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || Number.isNaN(Date.parse(dateText))) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  const conv = await convertToCzk(1, currency as Currency, new Date(`${dateText}T00:00:00.000Z`));
  if (!conv) return NextResponse.json({ error: "rate_unavailable" }, { status: 404 });

  return NextResponse.json({
    rateToCzk: conv.rateUsed.toString(),
    rateDate: conv.rateDate.toISOString().slice(0, 10),
  });
}
