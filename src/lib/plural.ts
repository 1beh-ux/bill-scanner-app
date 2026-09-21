// Czech has three plural forms (1 / 2-4 / 5+ and 0), English two. Used with
// translation keys like `x.bills.one|few|many` so "2 účtenky" / "5 účtenek"
// come out right instead of a fixed "počet účtenek" label.
export type PluralForm = "one" | "few" | "many";

export function pluralForm(count: number, lang: "cs" | "en"): PluralForm {
  const n = Math.abs(Math.trunc(count));
  if (lang === "en") return n === 1 ? "one" : "many";
  if (n === 1) return "one";
  if (n >= 2 && n <= 4) return "few";
  return "many";
}
