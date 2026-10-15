// AI cost metering: one AiUsage row per Gemini call (src/lib/ai-extraction.ts), cost frozen
// at write time from the "Ceny GCP" setting. Super-admin view: /vyuziti.
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { aiCostUsd, EMPTY_PRICES, parsePrices, type GcpPrices } from "@/lib/gcp-prices";

export const PRICES_KEY = "gcpPrices";

export async function getPrices(): Promise<GcpPrices> {
  const row = await prisma.appSetting.findUnique({ where: { key: PRICES_KEY } });
  return (row && parsePrices(row.value)) || EMPTY_PRICES;
}

export type AiMeter = { eventId: string; billId?: string | null; userId?: string | null; purpose: "bill_extraction" | "bill_reprocess" };
export type AiTokens = { model: string; input: number; output: number; thinking: number };

/** Never throws: metering must not break the extraction it measures. */
export async function recordAiUsage(meter: AiMeter, tokens: AiTokens, success: boolean): Promise<void> {
  try {
    const cost = aiCostUsd(await getPrices(), tokens.model, tokens);
    await prisma.aiUsage.create({
      data: {
        eventId: meter.eventId,
        billId: meter.billId ?? null,
        userId: meter.userId ?? null,
        purpose: meter.purpose,
        model: tokens.model,
        inputTokens: tokens.input,
        outputTokens: tokens.output,
        thinkingTokens: tokens.thinking,
        costUsd: cost === null ? null : new Prisma.Decimal(cost.toFixed(6)),
        success,
      },
    });
  } catch (err) {
    console.log("[ai-usage] could not record usage:", String(err));
  }
}
