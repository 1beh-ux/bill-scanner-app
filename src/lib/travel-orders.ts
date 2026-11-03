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
