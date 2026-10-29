"use client";

import { useRef } from "react";
import { useTranslations } from "@/lib/i18n";
import { eventDayList, intervalsText } from "@/lib/adults";

// Days at the event as a row of day chips (2026-10-29): click a day on / off, Shift+click marks a whole range,
// so "first two days, away for two, back again" is three clicks. value [] = the whole event.
export default function DaysPicker({ eventStart, eventEnd, value, onChange }: { eventStart: string; eventEnd: string; value: string[]; onChange: (days: string[]) => void }) {
  const { lang, t } = useTranslations();
  const all = eventDayList(eventStart, eventEnd);
  const on = new Set(value.length ? value : all);
  const last = useRef<string | null>(null);
  // Every day ticked = the whole event (stored as [], follows the event if its dates move).
  const emit = (next: Set<string>) => onChange(all.every((d) => next.has(d)) && [...next].every((d) => all.includes(d)) ? [] : [...next].sort());
  function click(d: string, shift: boolean) {
    const next = new Set(on);
    if (shift && last.current && last.current !== d) {
      const [a, b] = [last.current, d].sort();
      const target = !on.has(d);
      for (const x of all) if (x >= a && x <= b) (target ? next.add(x) : next.delete(x));
    } else if (next.has(d)) next.delete(d);
    else next.add(d);
    last.current = d;
    emit(next);
  }
  const label = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "cs-CZ", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" });
  // Days set before the event moved: shown so they can be dropped.
  const outside = value.filter((d) => !all.includes(d));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {all.map((d) => (
          <button
            key={d}
            type="button"
            onClick={(e) => click(d, e.shiftKey)}
            aria-pressed={on.has(d)}
            className={"rounded-md border px-1.5 py-0.5 text-[12px] tabular-nums " + (on.has(d) ? "border-pine bg-pine/15 text-pine" : "border-mist bg-paper-2 text-ink-secondary line-through")}
          >
            {label(d)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-secondary">
        <span>{value.length ? `${intervalsText(value)} (${value.filter((d) => all.includes(d)).length})` : t("adults.wholeEvent")}</span>
        {value.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-ember hover:underline">
            {t("adults.wholeEvent")}
          </button>
        )}
        <span>{t("adults.daysHint")}</span>
        {outside.length > 0 && (
          <button type="button" onClick={() => emit(new Set(value.filter((d) => all.includes(d))))} className="text-amber-700 hover:underline">
            {t("adults.dropOutside", { days: intervalsText(outside) })}
          </button>
        )}
      </div>
    </div>
  );
}
