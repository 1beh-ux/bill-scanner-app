// Cestovní příkazy (A2): the 2026 rate sets every organization starts with (new organizations at creation,
// existing ones via scripts/seed-travel-rates.ts). VERIFY against vyhláška č. 573/2025 Sb. and č. 175/2026 Sb.
// before go-live -- an organization admin corrects them in Organizace -> Sazby cestovních náhrad.
import type { Prisma } from "@/generated/prisma";
import type { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

// Copied from the old Excel template; its source is unknown.
export const DEFAULT_CONSUMPTION = { petrol: { manual: 6.9, auto: 7.6 }, diesel: { manual: 5.8, auto: 6.4 }, electric: { manual: 0, auto: 0 } };
const TABLE_NOTE = "Výchozí spotřeba z původní Excel šablony (zdroj neznámý).";

export const DEFAULT_RATE_SETS_2026 = [
  { validFrom: "2026-01-01", basePerKm: "5.90", trailerSurchargePct: "15", dieselPrice: "34.10", petrol95Price: "34.70", petrol98Price: "39.00", electricityPrice: "7.20", note: `Vyhláška č. 573/2025 Sb. (ověřit). ${TABLE_NOTE}` },
  { validFrom: "2026-06-01", basePerKm: "5.90", trailerSurchargePct: "15", dieselPrice: "44.50", petrol95Price: "34.70", petrol98Price: "39.00", electricityPrice: "7.20", note: `Vyhláška č. 175/2026 Sb. (ověřit). ${TABLE_NOTE}` },
  { validFrom: "2026-10-01", basePerKm: "5.90", trailerSurchargePct: "15", dieselPrice: "44.50", petrol95Price: "41.80", petrol98Price: "39.00", electricityPrice: "7.20", note: `Vyhláška č. 175/2026 Sb., změna od 1. 10. 2026 (ověřit). ${TABLE_NOTE}` },
];

/**
 * The default sets for an organization that has none yet (a new one, or the first seed). Once it has any, its
 * admins own the list: a set they deleted is never brought back by a later deploy's seed.
 */
export async function ensureDefaultTravelRates(db: Db, organizationId: string): Promise<number> {
  if (await db.travelRateSet.count({ where: { organizationId } })) return 0;
  const res = await db.travelRateSet.createMany({
    data: DEFAULT_RATE_SETS_2026.map((s) => ({ ...s, organizationId, validFrom: new Date(`${s.validFrom}T00:00:00Z`), consumptionDefaults: DEFAULT_CONSUMPTION })),
    skipDuplicates: true,
  });
  return res.count;
}
