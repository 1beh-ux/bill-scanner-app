// Cestovní příkazy (docs/claude-code-prompt-7-travel-orders.md A1): the one pure calculation of a travel order.
// Own car (AUV) only; stravné / nocležné / vedlejší are manual amounts added per leg. No JS floats: Decimal
// (decimal.js via Prisma) with ROUND_HALF_UP. Self-check: npx tsx scripts/check-travel-calc.ts
import { Prisma } from "@/generated/prisma";

const D = Prisma.Decimal.clone({ rounding: Prisma.Decimal.ROUND_HALF_UP, precision: 40 });
type Dec = InstanceType<typeof D>;
type Num = number | string | null | undefined;

export const FUELS = ["diesel", "petrol95", "petrol98", "electric"] as const;
export const GEARBOXES = ["manual", "automatic"] as const;
export type Fuel = (typeof FUELS)[number];
export type Gearbox = (typeof GEARBOXES)[number];
export type FuelGroup = "petrol" | "diesel" | "electric";
export type ConsumptionDefaults = Record<FuelGroup, { manual: Num; auto: Num }>;

/** The values of one TravelRateSet (prices Kč/l, electricity Kč/kWh). */
export type RateValues = {
  basePerKm: Num;
  trailerSurchargePct: Num;
  dieselPrice: Num;
  petrol95Price: Num;
  petrol98Price: Num;
  electricityPrice: Num;
  consumptionDefaults: ConsumptionDefaults;
};
export type LegInput = { km: Num; trailer?: boolean; stravne?: Num; nocleh?: Num; vedlejsi?: Num };
export type CalcInput = { rates: RateValues; fuel: Fuel; gearbox: Gearbox; tp: Num[]; receiptPrice?: Num; legs: LegInput[] };

export type CalcLeg = { index: number; km: string; trailer: boolean; kmAmount: string; extras: string; total: string };
export type CalcResult = {
  ok: true;
  consumption: string;
  consumptionSource: "tp" | "table";
  price: string;
  priceFromReceipt: boolean;
  fuelPerKm: string;
  legs: CalcLeg[];
  legsSum: string;
  total: string;
  totalKm: string;
  trailerKm: string;
  // Informational lines of the printed settlement, unrounded.
  fuelCost: string;
  kmRateAmount: string;
};
export type CalcError = { ok: false; errors: string[] };

export const fuelGroup = (f: Fuel): FuelGroup => (f === "diesel" ? "diesel" : f === "electric" ? "electric" : "petrol");
const isBlank = (v: Num) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const dec = (v: Num): Dec | null => {
  if (isBlank(v)) return null;
  try {
    const d = new D(typeof v === "string" ? v.trim().replace(",", ".") : v!);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
};

/** TP values 1–4 that are set and > 0, averaged and rounded to 2 places; else the rate set's table. */
export function consumptionOf(rates: RateValues, fuel: Fuel, gearbox: Gearbox, tp: Num[]): { value: Dec; source: "tp" | "table" } {
  const vals = tp.map(dec).filter((d): d is Dec => !!d && d.gt(0));
  if (vals.length) return { value: vals.reduce((s, d) => s.plus(d), new D(0)).div(vals.length).toDecimalPlaces(2, D.ROUND_HALF_UP), source: "tp" };
  const row = rates.consumptionDefaults?.[fuelGroup(fuel)];
  return { value: dec(gearbox === "automatic" ? row?.auto : row?.manual) ?? new D(0), source: "table" };
}

export const ratePrice = (rates: RateValues, fuel: Fuel): Num =>
  ({ diesel: rates.dieselPrice, petrol95: rates.petrol95Price, petrol98: rates.petrol98Price, electric: rates.electricityPrice })[fuel];

/** A leg counts when any of its values is filled in. */
export const legUsed = (l: LegInput) => !isBlank(l.km) || !isBlank(l.stravne) || !isBlank(l.nocleh) || !isBlank(l.vedlejsi);

export function calcTravelOrder(input: CalcInput): CalcResult | CalcError {
  const errors: string[] = [];
  if (!FUELS.includes(input.fuel)) errors.push("bad_fuel");
  if (!GEARBOXES.includes(input.gearbox)) errors.push("bad_gearbox");
  const base = dec(input.rates.basePerKm);
  const pct = dec(input.rates.trailerSurchargePct) ?? new D(0);
  if (!base || base.lt(0)) errors.push("bad_rates");
  const receipt = isBlank(input.receiptPrice) ? null : dec(input.receiptPrice);
  if (!isBlank(input.receiptPrice) && !(receipt && receipt.gt(0))) errors.push("bad_receipt_price");
  const price = receipt ?? dec(FUELS.includes(input.fuel) ? ratePrice(input.rates, input.fuel) : null);
  if (!price || price.lt(0)) errors.push("bad_rates");

  const used = input.legs.map((l, index) => ({ l, index })).filter(({ l }) => legUsed(l));
  if (!used.length) errors.push("no_legs");
  const parsed = used.map(({ l, index }) => {
    const km = dec(l.km);
    if (!km || km.lte(0)) errors.push(`leg_km:${index}`);
    const extras = [l.stravne, l.nocleh, l.vedlejsi].map((v) => {
      const d = isBlank(v) ? new D(0) : dec(v);
      if (!d || d.lt(0)) errors.push(`leg_amount:${index}`);
      return d ?? new D(0);
    });
    return { index, km: km ?? new D(0), trailer: !!l.trailer, extras: extras.reduce((s, d) => s.plus(d), new D(0)) };
  });
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };

  const { value: consumption, source } = consumptionOf(input.rates, input.fuel, input.gearbox, input.tp);
  const fuelPerKm = consumption.times(price!).div(100);
  const trailerBase = base!.times(pct.div(100).plus(1));
  const legs = parsed.map((p) => {
    const kmAmount = p.km.times(fuelPerKm.plus(p.trailer ? trailerBase : base!)).toDecimalPlaces(1, D.ROUND_HALF_UP);
    return { ...p, kmAmount, total: kmAmount.plus(p.extras) };
  });
  const legsSum = legs.reduce((s, l) => s.plus(l.total), new D(0));
  // CEILING(sum, 0.5)
  const total = legsSum.times(2).ceil().div(2);
  const totalKm = legs.reduce((s, l) => s.plus(l.km), new D(0));
  const trailerKm = legs.filter((l) => l.trailer).reduce((s, l) => s.plus(l.km), new D(0));
  return {
    ok: true,
    consumption: consumption.toFixed(2),
    consumptionSource: source,
    price: price!.toFixed(2),
    priceFromReceipt: !!receipt,
    fuelPerKm: fuelPerKm.toString(),
    legs: legs.map((l) => ({ index: l.index, km: l.km.toFixed(1), trailer: l.trailer, kmAmount: l.kmAmount.toFixed(1), extras: l.extras.toFixed(2), total: l.total.toFixed(2) })),
    legsSum: legsSum.toFixed(2),
    total: total.toFixed(2),
    totalKm: totalKm.toFixed(1),
    trailerKm: trailerKm.toFixed(1),
    fuelCost: totalKm.times(consumption).times(price!).div(100).toString(),
    kmRateAmount: totalKm.times(base!).plus(trailerKm.times(base!).times(pct.div(100))).toString(),
  };
}

/** The rate set for a trip: the greatest validFrom not later than the start day ("YYYY-MM-DD" compare). */
export function pickRateSet<T extends { validFrom: Date | string }>(sets: T[], startDate: Date | string): T | null {
  const day = (d: Date | string) => (typeof d === "string" ? d : d.toISOString()).slice(0, 10);
  const start = day(startDate);
  return sets.filter((s) => day(s.validFrom) <= start).sort((a, b) => (day(a.validFrom) < day(b.validFrom) ? 1 : -1))[0] ?? null;
}

/** Czech phone to "+420 xxx xxx xxx" (a stored number like 777123456 too); anything else trimmed as typed. */
export function normalizePhone(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const digits = s.replace(/[^\d+]/g, "").replace(/^00/, "+");
  const m = digits.match(/^(?:\+420)?(\d{9})$/);
  return m ? `+420 ${m[1].slice(0, 3)} ${m[1].slice(3, 6)} ${m[1].slice(6)}` : s.slice(0, 40);
}
