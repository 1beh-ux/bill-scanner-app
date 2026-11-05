// Cestovní příkazy (prompt 7 B): client-safe pieces shared by the form and the server -- the worker picker's
// de-duplication and the non-blocking warnings. Times are wall-clock "YYYY-MM-DDTHH:MM" strings (stored as the
// same digits in UTC), so nothing shifts with time zones.

export type WorkerAdult = { childId: string; name: string; address: string | null; phone: string | null };
export type WorkerPayer = { authorId: string; name: string; childId: string | null; address: string | null; phone: string | null; bankAccountNumber: string | null; bankCode: string | null };
export type WorkerEntry = {
  key: string;
  name: string;
  childId: string | null;
  authorId: string | null;
  address: string | null;
  phone: string | null;
  bankAccountNumber: string | null;
  bankCode: string | null;
  // An adult and a payer with the same name, not linked yet: one entry, and Propojit is offered.
  sameNameAuthorId: string | null;
};

export const normName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** The event's adults and payers as one list: linked pairs once, same-name pairs once (flagged), the rest as they are. */
export function mergeWorkers(adults: WorkerAdult[], payers: WorkerPayer[]): WorkerEntry[] {
  const out: WorkerEntry[] = [];
  const used = new Set<string>();
  for (const a of adults) {
    const linked = payers.find((p) => p.childId === a.childId);
    const same = linked ? null : payers.find((p) => !p.childId && !used.has(p.authorId) && normName(p.name) === normName(a.name));
    const p = linked ?? same ?? null;
    if (p) used.add(p.authorId);
    out.push({
      key: `c:${a.childId}`,
      name: a.name,
      childId: a.childId,
      authorId: p?.authorId ?? null,
      address: a.address ?? p?.address ?? null,
      phone: a.phone ?? p?.phone ?? null,
      bankAccountNumber: p?.bankAccountNumber ?? null,
      bankCode: p?.bankCode ?? null,
      sameNameAuthorId: same?.authorId ?? null,
    });
  }
  for (const p of payers) {
    if (used.has(p.authorId)) continue;
    out.push({ key: `a:${p.authorId}`, name: p.name, childId: p.childId, authorId: p.authorId, address: p.address, phone: p.phone, bankAccountNumber: p.bankAccountNumber, bankCode: p.bankCode, sameNameAuthorId: null });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, "cs"));
}

export type LegForm = { date: string; fromPlace: string; toPlace: string; departTime: string; arriveTime: string; trailer: boolean; km: string; stravne: string; nocleh: string; vedlejsi: string };
export type Warning = { code: "leg_before_start" | "leg_after_end" | "legs_not_continuous"; leg: number };

const placeKey = (s: string) => normName(s ?? "");

/** Do not block: a leg outside the order's start–end window, a leg starting where the previous one did not end. */
export function orderWarnings(startAt: string, endAt: string, legs: LegForm[]): Warning[] {
  const out: Warning[] = [];
  legs.forEach((l, i) => {
    if (l.date && l.departTime && startAt && `${l.date}T${l.departTime}` < startAt.slice(0, 16)) out.push({ code: "leg_before_start", leg: i });
    if (l.date && l.arriveTime && endAt && `${l.date}T${l.arriveTime}` > endAt.slice(0, 16)) out.push({ code: "leg_after_end", leg: i });
    const prev = legs[i - 1];
    if (prev && prev.toPlace && l.fromPlace && placeKey(prev.toPlace) !== placeKey(l.fromPlace)) out.push({ code: "legs_not_continuous", leg: i });
  });
  return out;
}

/** "YYYY-MM-DDTHH:MM" wall clock <-> the stored Date (same digits, UTC). */
export const wallToDate = (s: unknown): Date | null => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? new Date(`${s}:00Z`) : null);
export const dateToWall = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 16) : "");

/** T1 (audit2): one thing still missing before Odeslat, and the form field it belongs to (for scrolling). */
export type SubmitProblem = { code: string; field: string; legs?: number[] };

/**
 * Everything that blocks Odeslat, all at once (the server used to stop at the first). Pure: the order page lists
 * the same items live and the submit route returns them. `calc` = the live calculation (null without a rate set);
 * `bankValid` = the server's full account check, the page passes "both filled in".
 */
export function submitProblems(
  o: { startAt: unknown; endAt: unknown; workerName: unknown; workerAddress: unknown; workerPhone: unknown; vehicleLabel: unknown; fuel: unknown; gearbox: unknown; payoutMethod: unknown },
  calc: { ok: true } | { ok: false; errors: string[] } | null,
  rateOk: boolean,
  bankValid: boolean
): SubmitProblem[] {
  const out: SubmitProblem[] = [];
  const has = (v: unknown) => (typeof v === "string" ? v.trim() !== "" : v != null);
  if (!has(o.startAt) || !has(o.endAt)) out.push({ code: "no_dates", field: "dates" });
  if (!has(o.workerName)) out.push({ code: "no_worker", field: "worker" });
  if (!has(o.workerAddress)) out.push({ code: "no_address", field: "workerAddress" });
  if (!has(o.workerPhone)) out.push({ code: "no_phone", field: "workerPhone" });
  if (!has(o.vehicleLabel) || !has(o.fuel) || !has(o.gearbox)) out.push({ code: "no_vehicle", field: "vehicle" });
  if (!rateOk) out.push({ code: "no_rate_set", field: "rate" });
  else if (calc && calc.ok === false) {
    const legs = calc.errors.filter((e) => e.startsWith("leg_")).map((e) => Number(e.split(":")[1]));
    if (calc.errors.includes("no_legs")) out.push({ code: "no_legs", field: "legs" });
    else if (legs.length) out.push({ code: "bad_legs", field: "legs", legs: [...new Set(legs)] });
    for (const e of calc.errors) if (e !== "no_legs" && !e.startsWith("leg_")) out.push({ code: e, field: "rate" });
  }
  if (o.payoutMethod === "bank" && !bankValid) out.push({ code: "payout_missing", field: "payout" });
  return out;
}
