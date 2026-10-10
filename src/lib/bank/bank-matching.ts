// Pure bank-movement matching (docs/bank-payments-design.md Part 2) -- no DB.
// scripts/check-bank-matching.ts is its self-check.
import { normalizeVs, type FioMovement } from "@/lib/bank/fio-client";

export type ReviewReason = "underpaid" | "overpaid" | "no_match" | "ambiguous" | "duplicate" | "not_czk";

/** Accepted participant of an event checking this account, with a payment document type and a price. */
export type Candidate = {
  participantId: string;
  acceptedVs: string | null;
  currentVs: string | null;
  expected: number;
  paid: boolean;
};

export type Decision =
  | { movementId: string; status: "settled"; reason: null; participantId: string }
  | { movementId: string; status: "review"; reason: ReviewReason; participantId: string | null };

/**
 * One decision per incoming movement (outgoing ones get none; a movement id
 * seen twice is decided once). Never guesses: anything but exactly one
 * unpaid match with enough money goes to review.
 */
export function matchMovements(movements: Pick<FioMovement, "movementId" | "amount" | "currency" | "variableSymbol">[], candidates: Candidate[]): Decision[] {
  const paid = new Set(candidates.filter((c) => c.paid).map((c) => c.participantId));
  const seen = new Set<string>();
  const decisions: Decision[] = [];
  for (const m of movements) {
    if (m.amount <= 0 || seen.has(m.movementId)) continue;
    seen.add(m.movementId);
    const review = (reason: ReviewReason, participantId: string | null = null) => decisions.push({ movementId: m.movementId, status: "review", reason, participantId });
    if (m.currency !== "CZK") {
      review("not_czk");
      continue;
    }
    const vs = normalizeVs(m.variableSymbol);
    const hits = vs ? candidates.filter((c) => normalizeVs(c.acceptedVs) === vs || normalizeVs(c.currentVs) === vs) : [];
    if (hits.length === 0) review("no_match");
    else if (hits.length > 1) review("ambiguous");
    else {
      const c = hits[0];
      if (paid.has(c.participantId)) review("duplicate", c.participantId);
      else if (m.amount > 2 * c.expected) review("overpaid", c.participantId);
      else if (m.amount < c.expected) review("underpaid", c.participantId);
      else {
        paid.add(c.participantId);
        decisions.push({ movementId: m.movementId, status: "settled", reason: null, participantId: c.participantId });
      }
    }
  }
  return decisions;
}
