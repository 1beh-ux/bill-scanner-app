// Cestovní příkazy (A2): rate sets of the acting organization -- parsing input and the diagnostics.
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

const PRICE_FIELDS = ["basePerKm", "trailerSurchargePct", "dieselPrice", "petrol95Price", "petrol98Price", "electricityPrice"] as const;
const GROUPS = ["petrol", "diesel", "electric"] as const;

const num = (v: unknown): Prisma.Decimal | null => {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim().replace(",", ".") : "";
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const d = new Prisma.Decimal(s);
  return d.lt(100000) ? d : null;
};

/** The body of a rate-set create / edit, or the list of bad fields. */
export function parseRateSet(b: Record<string, unknown>): { data: Omit<Prisma.TravelRateSetUncheckedCreateInput, "organizationId"> } | { bad: string[] } {
  const bad: string[] = [];
  const validFrom = typeof b.validFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.validFrom) ? new Date(`${b.validFrom}T00:00:00Z`) : null;
  if (!validFrom || isNaN(validFrom.getTime())) bad.push("validFrom");
  const prices = Object.fromEntries(PRICE_FIELDS.map((f) => [f, num(b[f])]));
  for (const f of PRICE_FIELDS) if (!prices[f]) bad.push(f);
  const cd = (b.consumptionDefaults ?? {}) as Record<string, Record<string, unknown>>;
  const consumptionDefaults = Object.fromEntries(
    GROUPS.map((g) => {
      const row = { manual: num(cd[g]?.manual), auto: num(cd[g]?.auto) };
      if (!row.manual) bad.push(`${g}.manual`);
      if (!row.auto) bad.push(`${g}.auto`);
      return [g, { manual: Number(row.manual ?? 0), auto: Number(row.auto ?? 0) }];
    }),
  );
  if (bad.length) return { bad };
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 1000) || null : null;
  return { data: { validFrom: validFrom!, ...(prices as Record<(typeof PRICE_FIELDS)[number], Prisma.Decimal>), consumptionDefaults, note } };
}

/** Events of the organization (not closed) that start before its first rate set, or with no set at all. */
export async function missingRateEvents(organizationId: string): Promise<{ eventId: string; name: string; startDate: string; firstValidFrom: string | null }[]> {
  const [first, events] = await Promise.all([
    prisma.travelRateSet.findFirst({ where: { organizationId }, orderBy: { validFrom: "asc" }, select: { validFrom: true } }),
    prisma.event.findMany({ where: { organizationId, status: { not: "closed" } }, select: { id: true, name: true, startDate: true }, orderBy: { startDate: "asc" } }),
  ]);
  return events
    .filter((e) => !first || e.startDate < first.validFrom)
    .map((e) => ({ eventId: e.id, name: e.name, startDate: e.startDate.toISOString().slice(0, 10), firstValidFrom: first ? first.validFrom.toISOString().slice(0, 10) : null }));
}
