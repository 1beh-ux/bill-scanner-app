// Registration status + upload review (docs/registration-slice4-spec.md 3, 6,
// 8) -- pure, no DB, no Node-only imports: the portal, the admin roster and
// the self-check (scripts/test-registration-slice4.ts) share it.

export type ReviewStatus = "pending" | "approved" | "rejected";
type DocRow = { eventListItemId: string; receivedVia: string; reviewStatus: ReviewStatus | null; reviewNote?: string | null };

// A portal upload waiting for review (or rejected) is NOT received. Prisma
// where-fragment for every "received" query (the roster count, document
// status, Mail status e-mails / sheet export via getReceivedItemIds) --
// written as an OR because `not` on a nullable column would drop the nulls.
export const NOT_IN_REVIEW = { OR: [{ reviewStatus: null }, { reviewStatus: "approved" as const }] };
export const RECEIVED_WHERE = { receivedVia: { not: "generated" as const }, ...NOT_IN_REVIEW };

/** Same rule in JS: returned by a guardian (not generated) and not waiting / rejected. */
export const countsAsReceived = (d: { receivedVia: string; reviewStatus: ReviewStatus | null }) =>
  d.receivedVia !== "generated" && (d.reviewStatus == null || d.reviewStatus === "approved");

export type DocState = { state: "received" | "pending" | "rejected" | "none"; note: string | null };

/** One document type of one registration: received wins, then an upload in review, then the last rejection. */
export function docState(docs: DocRow[], typeId: string): DocState {
  const mine = docs.filter((d) => d.eventListItemId === typeId);
  if (mine.some(countsAsReceived)) return { state: "received", note: null };
  if (mine.some((d) => d.reviewStatus === "pending")) return { state: "pending", note: null };
  const rejected = mine.find((d) => d.reviewStatus === "rejected");
  return rejected ? { state: "rejected", note: rejected.reviewNote ?? null } : { state: "none", note: null };
}

export type RegistrationState = "missing" | "waiting" | "complete";
export const REGISTRATION_STATES: RegistrationState[] = ["missing", "waiting", "complete"];

/**
 * missing = a required field is empty, a tracked document type has nothing
 *   received (an upload in review is "waiting", not missing), or -- accepted
 *   with a payment document type set -- the payment isn't received;
 * waiting = registration pending, an upload in review or a pending profile
 *   change, and nothing missing;
 * complete = the rest (accepted, nothing missing or waiting).
 * `docs` = the registration's rows (generated ones are ignored).
 */
export function registrationState(r: {
  accepted: boolean;
  docTypeIds: string[];
  paymentDocTypeId: string | null;
  docs: DocRow[];
  requiredEmpty: boolean;
  pendingProfileChange: boolean;
}): RegistrationState {
  const docTypes = r.docTypeIds.filter((id) => id !== r.paymentDocTypeId);
  const unpaid = r.accepted && !!r.paymentDocTypeId && docState(r.docs, r.paymentDocTypeId).state !== "received";
  const docMissing = docTypes.some((id) => ["none", "rejected"].includes(docState(r.docs, id).state));
  if (r.requiredEmpty || docMissing || unpaid) return "missing";
  if (!r.accepted || r.pendingProfileChange || r.docs.some((d) => d.reviewStatus === "pending")) return "waiting";
  return "complete";
}

/** Whether any of the required keys is empty in `values`. */
export const requiredEmpty = (requiredKeys: string[], values: Record<string, string | undefined>) => requiredKeys.some((k) => !values[k]?.trim());
