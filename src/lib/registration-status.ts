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

// Permanent documents on the person (docs/registration-slice6-spec.md) -- the
// pure rules; src/lib/person-documents.ts does the DB / file side.

/** Only a real received file becomes a person document: never a tick (no file), a generated one or an upload in review. */
export const canBecomePersonDocument = (d: { gcsPath: string | null; receivedVia: string; reviewStatus: ReviewStatus | null }) => !!d.gcsPath && countsAsReceived(d);

type PersonDocRow = { docKey: string; createdAt: Date; revokedAt: Date | null };

/** The person's valid document of a type: the newest one not revoked (older ones are history). */
export function currentPersonDoc<T extends PersonDocRow>(docs: T[], key: string): T | null {
  let best: T | null = null;
  for (const d of docs) if (d.docKey === key && !d.revokedAt && (!best || d.createdAt > best.createdAt)) best = d;
  return best;
}

/**
 * The event's document types a person document covers (slice 6 #4): the
 * type's key is a permanent template's, the event doesn't "vyžadovat nový"
 * (data.requireNew) and the person has a current document of it -- whatever
 * the event's dates. Shaped as document rows (receivedVia "profile") so
 * countsAsReceived / docState / registrationState count them as received.
 * `docs` = [] for a participant not linked to a person (= unchanged).
 */
export function profileDocRows<T extends PersonDocRow>(types: { id: string; key: string | null; data: unknown }[], permanentKeys: Set<string>, docs: T[]) {
  return types.flatMap((t) => {
    if (!t.key || !permanentKeys.has(t.key) || (t.data as { requireNew?: boolean } | null)?.requireNew) return [];
    const doc = currentPersonDoc(docs, t.key);
    return doc ? [{ eventListItemId: t.id, receivedVia: "profile" as const, reviewStatus: null, doc }] : [];
  });
}

/**
 * Turning "platí trvale" on (slice 6 #6), for one document key: per person
 * without a current document, their newest received file (not generated,
 * not in review) that isn't already the source of a person document
 * (a revoked one stays revoked). Manual rows are skipped: before slice 6 a
 * manual row with a file is a generated document ticked as received (the
 * toggle upgrades it in place) -- a blank form, not the signed one; the
 * slice-6 admin upload (also manual) became a person document when uploaded.
 */
export function backfillPicks<T extends { id: string; childId: string; receivedAt: Date; gcsPath: string | null; receivedVia: string; reviewStatus: ReviewStatus | null }>(
  candidates: T[],
  existing: { childId: string; sourceParticipantDocumentId: string | null; revokedAt: Date | null }[]
): T[] {
  const covered = new Set(existing.filter((e) => !e.revokedAt).map((e) => e.childId));
  const used = new Set(existing.map((e) => e.sourceParticipantDocumentId));
  const picks = new Map<string, T>();
  for (const c of candidates) {
    if (covered.has(c.childId) || used.has(c.id) || c.receivedVia === "manual" || !canBecomePersonDocument(c)) continue;
    const best = picks.get(c.childId);
    if (!best || c.receivedAt > best.receivedAt) picks.set(c.childId, c);
  }
  return [...picks.values()];
}
