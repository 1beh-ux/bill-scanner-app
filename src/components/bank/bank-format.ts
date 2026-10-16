// Banka screens: shared formatting + Czech plurals (1 pohyb / 2–4 pohyby / 5+ pohybů).
export const kc = (n: number) => n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dmy = (s: string | Date | null | undefined) => (s ? new Date(s).toLocaleDateString("cs-CZ", { timeZone: "UTC" }) : "");
/** Plural form key suffix for Czech: one | few | many. */
export const pluralForm = (n: number) => (n === 1 ? "one" : n >= 2 && n <= 4 ? "few" : "many");
export type Reason = { k: "amount" } | { k: "fx" } | { k: "date"; d: number } | { k: "merchant"; v: string } | { k: "text" };
export function reasonText(r: Reason, t: (k: string, v?: Record<string, string>) => string): string {
  if (r.k === "date") return t("bankReason.date", { d: (r.d > 0 ? "+" : "") + String(r.d) });
  if (r.k === "merchant") return t("bankReason.merchant", { v: r.v });
  return t(`bankReason.${r.k}`);
}
