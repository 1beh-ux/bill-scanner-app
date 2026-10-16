// Client-safe list of bill payment states (the server logic: src/lib/bank/payment-state.ts).
export type PaymentState = "bank" | "partial" | "cash" | "other_account" | "suggested" | "unpaired";
export const PAYMENT_STATES: PaymentState[] = ["bank", "partial", "cash", "other_account", "suggested", "unpaired"];
