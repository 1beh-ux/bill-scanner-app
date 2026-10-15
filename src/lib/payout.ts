// Who gets money paid out (Plátci: "Oficiální účet organizace" / "Řeší se proplacení"):
// a bill is paid out only when its payer needs a payout and isn't the organization's official
// account. "Akce" (no payer) and the official account count as spent directly by the organization
// (manifest summary, budget settlement). Client-safe.
type PayerFlags = { isOfficialAccount?: boolean; payoutNeeded?: boolean } | null | undefined;

/** Prisma `where` for a payer whose bills are paid out. */
export const PAYOUT_PAYER_WHERE = { payoutNeeded: true, isOfficialAccount: false } as const;

export const needsPayout = (payer: PayerFlags) => !!payer && payer.payoutNeeded !== false && !payer.isOfficialAccount;

/** Paid from the organization's official account: no payer ("Akce") or the official-account payer. */
export const paidOfficially = (payer: PayerFlags) => !payer || !!payer.isOfficialAccount;
