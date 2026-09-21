/** Czech money format with exactly two decimals: 561.2 -> "561,20 Kč". */
export function formatCzk(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return `${(Number.isFinite(n) ? n : 0).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`;
}
