"use client";

import { useTranslations } from "@/lib/i18n";
import { allergenLabels, ALLERGENS } from "@/lib/kitchen/allergens";
import { formatQty } from "@/lib/kitchen/sizing";

// Kuchyně, shared bits of the screens.
export const inputClass = "w-full rounded-lg border border-mist bg-paper-2 px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ember";
export const inputSm = "rounded-lg border border-mist bg-paper-2 px-2 py-1 text-[13px] text-ink";
export const btn = "rounded-lg border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50";
export const btnPrimary = "rounded-lg bg-ember px-4 py-2 text-[14px] font-medium text-white hover:bg-ember-hover disabled:opacity-50";
export const fmtDay = (iso: string, lang = "cs") => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "cs-CZ", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" });

export async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null);
  return res;
}

/** "1,5 kg", with the ingredient's second unit ("≈ 11 hrnek", "12 stroužek"); 0 = "dle potřeby". */
export function Qty({ q, unit, altName, altQty }: { q: number; unit: string; altName?: string | null; altQty?: number | null }) {
  const { t } = useTranslations();
  if (q === 0) return <span className="text-ink-secondary">{t("kitchen.meal.asNeeded")}</span>;
  const f = formatQty(q, unit as "g" | "ml" | "ks");
  const alt = altName && altQty ? Math.round((q / altQty) * 10) / 10 : null;
  return (
    <span className="tabular-nums">
      {f.value} {f.unit}
      {alt != null && (
        <span className="ml-1 text-[0.85em] font-normal text-ink-secondary">
          ({unit === "ks" && altQty === 1 ? "" : "≈ "}
          {alt.toLocaleString("cs-CZ")} {altName})
        </span>
      )}
    </span>
  );
}

/** The allergens as number + short name ("1 – lepek, 7 – mléko", K4 audit2); official names in the tooltip. */
export function AllergenList({ codes, empty }: { codes: string[]; empty?: string }) {
  const { lang } = useTranslations();
  if (!codes.length) return empty ? <span className="text-ink-secondary">{empty}</span> : null;
  const list = ALLERGENS.filter((a) => codes.includes(a.code));
  return <span title={list.map((a) => `${a.no}. ${lang === "en" ? a.en : a.cs}`).join(", ")}>{allergenLabels(codes, lang).join(", ")}</span>;
}

export const allergenNames = (codes: string[], lang: string) =>
  ALLERGENS.filter((a) => codes.includes(a.code))
    .map((a) => (lang === "en" ? a.en : a.cs))
    .join(", ");

/** The allergen check's traffic light: red (someone without a safe plate), amber (neověřeno), ok. */
export function CheckBadge({ level }: { level: "red" | "amber" | "ok" | null | undefined }) {
  const { t } = useTranslations();
  if (!level) return null;
  const cls = level === "red" ? "bg-red-600/15 text-red-700" : level === "amber" ? "bg-amber-500/15 text-amber-700" : "bg-pine/15 text-pine";
  return <span className={"rounded-full px-2 py-0.5 text-[11.5px] font-medium " + cls}>{t(`kitchen.check.${level}`)}</span>;
}

export function NoAccess() {
  const { t } = useTranslations();
  return <div className="p-8 text-[14px] text-ink-secondary">{t("kitchen.noAccess")}</div>;
}
