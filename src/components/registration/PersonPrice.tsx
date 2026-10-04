"use client";

// One person's price category (+ the "Oddíl" choice when the category asks
// for it) and live price, in the portal and the public registration form
// (docs/registration-slice3-spec.md C/D). Prices come from previewPrices()
// in src/lib/price-rules.ts; the stored price is always computed live later.
export type CategoryOption = { key: string; label: string; asksOddil: boolean };
export type OddilField = { key: string; label: string; options: string[] };

const selectClass =
  "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[15px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";

export default function PersonPrice({
  categories,
  category,
  onCategory,
  oddil,
  oddilValue,
  onOddil,
  price,
  t,
}: {
  categories: CategoryOption[];
  category: string | undefined;
  onCategory: (key: string) => void;
  oddil: OddilField | null;
  oddilValue: string | undefined;
  onOddil: (v: string) => void;
  price: number | null;
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  const current = categories.find((c) => c.key === category) ?? categories[0];
  return (
    <div className="flex flex-col gap-2">
      {categories.length > 1 && (
        <label className="text-[13px] text-ink-secondary">
          {t("portal.priceCategory")}
          <select value={current?.key ?? ""} onChange={(e) => onCategory(e.target.value)} className={selectClass + " mt-1"}>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {categories.length === 1 && <span className="text-[13px] text-ink-secondary">{current.label}</span>}
      {current?.asksOddil && oddil && (
        <label className="text-[13px] text-ink-secondary">
          {oddil.label} *
          <select value={oddilValue ?? ""} onChange={(e) => onOddil(e.target.value)} className={selectClass + " mt-1"}>
            <option value="">—</option>
            {oddil.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      )}
      {price != null && <span className="text-[14px] font-medium text-ink">{t("portal.price", { price: String(price) })}</span>}
    </div>
  );
}
