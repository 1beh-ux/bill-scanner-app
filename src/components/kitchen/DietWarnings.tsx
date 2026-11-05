"use client";

import { useTranslations } from "@/lib/i18n";

// Kuchyně (audit 2026-11-05): everyone whose allergy text has words no allergen / diet matched ("anafylaxe",
// "nesmí ořechy"), with the parent's own text -- printed too, so the cook never reads "no allergens" alone.
export type DietWarning = { name: string; rawText: string; unmapped: string[]; confirmed: boolean };

export default function DietWarnings({ warnings, eventId }: { warnings?: DietWarning[]; eventId: string }) {
  const { t } = useTranslations();
  if (!warnings?.length) return null;
  return (
    <section className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-900 break-inside-avoid">
      <a href={`/events/${eventId}/kitchen/diets`} className="font-semibold hover:underline">
        ⚠ {t("kitchen.dietWarnings.title")}
      </a>
      <ul className="mt-1 flex flex-col gap-0.5">
        {warnings.map((w, i) => (
          <li key={i}>
            <b>{w.name}</b>: „{w.rawText}“ <UnmappedChip words={w.unmapped} />
            {!w.confirmed && <span className="ml-1 text-amber-800">({t("kitchen.dietWarnings.unconfirmed")})</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "text obsahuje nepřiřazené výrazy: …" */
export function UnmappedChip({ words }: { words?: string[] }) {
  const { t } = useTranslations();
  if (!words?.length) return null;
  return <span className="ml-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[11.5px] font-medium text-red-800">{t("kitchen.dietWarnings.chip", { words: words.join(", ") })}</span>;
}
