import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { usageGuard } from "@/lib/usage-guard";
import { getPrices, PRICES_KEY } from "@/lib/ai-usage";
import { parsePrices } from "@/lib/gcp-prices";
import { usedModels } from "@/lib/usage-queries";

// /vyuziti -> Ceny GCP (super-admin). New AI calls are costed with these; existing rows keep theirs.
export async function GET(req: NextRequest) {
  const g = await usageGuard(req);
  if ("error" in g) return g.error;
  const prices = await getPrices();
  const models = [...new Set(["gemini-2.5-pro", ...Object.keys(prices.models), ...(await usedModels())])].filter((m) => m !== "unknown").sort();
  return NextResponse.json({ prices, models });
}

export async function PUT(req: NextRequest) {
  const g = await usageGuard(req);
  if ("error" in g) return g.error;
  const prices = parsePrices(await req.json().catch(() => null));
  if (!prices) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  await prisma.appSetting.upsert({ where: { key: PRICES_KEY }, update: { value: prices }, create: { key: PRICES_KEY, value: prices } });
  return NextResponse.json({ prices });
}
