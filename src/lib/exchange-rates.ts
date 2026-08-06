import { Prisma } from "@/generated/prisma";
import type { Currency } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

const CNB_URL =
  "https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt";

const TRACKED: Currency[] = ["PLN", "EUR"];

export interface ParsedRate {
  currency: Currency;
  rateToCzk: Prisma.Decimal;
}

export interface CnbDay {
  rateDate: Date;
  rates: ParsedRate[];
}

function formatCnbDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

function parseCnbDate(s: string): Date {
  const [dd, mm, yyyy] = s.trim().split(".").map(Number);
  return new Date(Date.UTC(yyyy, mm - 1, dd));
}

/**
 * ČNB daily fixing format:
 *   30.07.2026 #145
 *   země|měna|množství|kód|kurz
 *   EMU|euro|1|EUR|24,165
 *
 * The "množství" column matters — some currencies are quoted per 100 or 1000
 * units, so the published rate is divided by it to get a per-unit rate.
 */
export function parseCnbText(text: string): CnbDay {
  const lines = text.trim().split("\n");
  if (lines.length < 3) {
    throw new Error("cnb_unexpected_format");
  }

  const rateDate = parseCnbDate(lines[0].split("#")[0]);
  const rates: ParsedRate[] = [];

  for (const line of lines.slice(2)) {
    const parts = line.split("|");
    if (parts.length < 5) continue;

    const amount = Number(parts[2]);
    const code = parts[3].trim() as Currency;
    const rate = Number(parts[4].trim().replace(",", "."));

    if (!TRACKED.includes(code)) continue;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (!Number.isFinite(rate) || rate <= 0) continue;

    rates.push({
      currency: code,
      rateToCzk: new Prisma.Decimal(rate).dividedBy(amount),
    });
  }

  if (rates.length === 0) {
    throw new Error("cnb_no_tracked_rates");
  }

  return { rateDate, rates };
}

export async function fetchCnbDay(date?: Date): Promise<CnbDay> {
  const url = date ? `${CNB_URL}?date=${formatCnbDate(date)}` : CNB_URL;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`cnb_http_${res.status}`);
  }

  return parseCnbText(await res.text());
}

export async function syncRatesForDate(
  date?: Date
): Promise<{ rateDate: Date; stored: number }> {
  const day = await fetchCnbDay(date);

  for (const r of day.rates) {
    await prisma.exchangeRate.upsert({
      where: {
        currency_rateDate: { currency: r.currency, rateDate: day.rateDate },
      },
      create: {
        currency: r.currency,
        rateDate: day.rateDate,
        rateToCzk: r.rateToCzk,
      },
      update: {
        rateToCzk: r.rateToCzk,
        fetchedAt: new Date(),
      },
    });
  }

  return { rateDate: day.rateDate, stored: day.rates.length };
}

/**
 * Backfill. ČNB asks that its endpoints not be hit excessively, so this is
 * capped and paced deliberately.
 */
export async function backfillRates(
  days: number
): Promise<{ requested: number; days: string[] }> {
  const capped = Math.min(Math.max(days, 1), 60);
  const seen = new Set<string>();
  const today = new Date();

  for (let i = 0; i < capped; i++) {
    const d = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i)
    );
    const result = await syncRatesForDate(d);
    seen.add(result.rateDate.toISOString().slice(0, 10));
    await new Promise((r) => setTimeout(r, 350));
  }

  return { requested: capped, days: Array.from(seen).sort() };
}

export interface ConversionResult {
  amountCzk: Prisma.Decimal;
  rateUsed: Prisma.Decimal;
  rateDate: Date;
}

/**
 * ČNB publishes every business day, so the largest legitimate gap between a
 * bill's date and the rate that applies to it is a long weekend plus holidays.
 * A larger gap means we simply don't have the right data yet.
 */
const MAX_RATE_AGE_DAYS = 7;

function daysBetween(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 86400000);
}

async function findStoredRate(currency: Currency, billDate: Date) {
  return prisma.exchangeRate.findFirst({
    where: { currency, rateDate: { lte: billDate } },
    orderBy: { rateDate: "desc" },
  });
}

/**
 * Per the data schema: use the most recent published rate on or before the
 * bill's own date. That single rule covers weekends and bank holidays.
 *
 * If no stored rate is close enough — an old bill entered long after the fact,
 * or a gap in the daily sync — the rate for that specific date is fetched from
 * ČNB and stored, so this self-heals instead of leaving the bill unconverted.
 */
export async function convertToCzk(
  amount: Prisma.Decimal | string | number,
  currency: Currency,
  billDate: Date,
  options: { allowFetch?: boolean } = {}
): Promise<ConversionResult | null> {
  const { allowFetch = true } = options;
  const value = new Prisma.Decimal(amount);

  if (currency === "CZK") {
    return {
      amountCzk: value,
      rateUsed: new Prisma.Decimal(1),
      rateDate: billDate,
    };
  }

  let rate = await findStoredRate(currency, billDate);

  const tooOld = rate && daysBetween(billDate, rate.rateDate) > MAX_RATE_AGE_DAYS;

  if ((!rate || tooOld) && allowFetch) {
    try {
      await syncRatesForDate(billDate);
      rate = await findStoredRate(currency, billDate);
    } catch {
      // ČNB unreachable or no data for that date — fall through and use
      // whatever was already stored, if anything.
    }
  }

  if (!rate) return null;

  const rateUsed = new Prisma.Decimal(rate.rateToCzk);

  return {
    amountCzk: value.times(rateUsed).toDecimalPlaces(2),
    rateUsed,
    rateDate: rate.rateDate,
  };
}
