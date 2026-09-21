// Client-side helpers for the event-scoped payer endpoints
// (src/app/api/events/[id]/payers) shared by the payers page, the bill form
// combobox and the payments page.

export type Payer = {
  id: string;
  canonicalName: string;
  bankAccountNumber: string | null;
  bankCode: string | null;
  billCount?: number;
  lastBankChange?: { at: string; byName: string; source: string } | null;
};

export type SimilarPayer = { id: string; canonicalName: string };

export type PayerResult<T> = { ok: true; data: T } | { ok: false; error: string; extra?: Record<string, unknown> };

async function parse<T>(res: Response): Promise<PayerResult<T>> {
  const json = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, data: json as T };
  return { ok: false, error: typeof json?.error === "string" ? json.error : "generic", extra: json };
}

export async function createPayer(
  eventId: string,
  v: { name: string; account: string; code: string },
  confirmSimilar = false
): Promise<PayerResult<Payer>> {
  const res = await fetch(`/api/events/${eventId}/payers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      canonicalName: v.name,
      bankAccountNumber: v.account,
      bankCode: v.code,
      ...(confirmSimilar && { confirmSimilar: true }),
    }),
  });
  return parse<Payer>(res);
}

export async function attachPayer(eventId: string, authorId: string): Promise<PayerResult<Payer>> {
  const res = await fetch(`/api/events/${eventId}/payers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authorId }),
  });
  return parse<Payer>(res);
}

export async function updatePayer(
  eventId: string,
  payerId: string,
  patch: { canonicalName?: string; bankAccountNumber?: string; bankCode?: string }
): Promise<PayerResult<Payer>> {
  const res = await fetch(`/api/events/${eventId}/payers/${payerId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return parse<Payer>(res);
}

export async function removePayer(eventId: string, payerId: string, confirm = false): Promise<PayerResult<{ billCount: number }>> {
  const res = await fetch(`/api/events/${eventId}/payers/${payerId}${confirm ? "?confirm=true" : ""}`, { method: "DELETE" });
  return parse<{ billCount: number }>(res);
}

/** True when the last bank change is within `days` (default 30). */
export function isRecentBankChange(change: Payer["lastBankChange"], days = 30): boolean {
  if (!change) return false;
  return Date.now() - new Date(change.at).getTime() < days * 24 * 3600 * 1000;
}
