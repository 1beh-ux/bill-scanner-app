// Dospělí na akci (2026-10-28): the report of the event's adults (income / subsidies) -- facts only, no amounts.
// Pure, client-safe; the page and the CSV use it. Dates are UTC days (YYYY-MM-DD).
import { ageOn } from "@/lib/age";

// The organization's address fields (profile values, Šablony -> Účastníci) the report reads.
export const ADDRESS_KEYS = { street: "adresa_ulice_cp", municipality: "adresa_mesto", zip: "adresa_psc" } as const;

export type AdultAssignment = {
  name: string;
  dateOfBirth: string | null;
  fieldValues: Record<string, unknown> | null;
  // The days at the event; empty = the whole event.
  days: string[];
};
export type AdultReportRow = { name: string; dateOfBirth: string | null; age: number | null; municipality: string; zip: string; from: string; to: string; periods: string; days: number; outside: boolean };

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Every day of the event, first to last ("YYYY-MM-DD"). */
export function eventDayList(eventStart: string, eventEnd: string): string[] {
  const out: string[] = [];
  for (let d = day(eventStart); d <= day(eventEnd) && out.length < 400; d = new Date(d.getTime() + 86400000)) out.push(iso(d));
  return out;
}

/** The days someone is at the event: their own (sorted, unique) or, when none are set, all of the event's. */
export const presentDays = (days: string[], eventStart: string, eventEnd: string) => (days.length ? [...new Set(days.map((d) => d.slice(0, 10)))].sort() : eventDayList(eventStart, eventEnd));

/** Runs of consecutive days: ["07-01","07-02","07-05"] -> [{from 07-01, to 07-02}, {from 07-05, to 07-05}]. */
export function dayIntervals(days: string[]): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (const d of [...new Set(days)].sort()) {
    const last = out[out.length - 1];
    if (last && day(d).getTime() - day(last.to).getTime() === 86400000) last.to = d;
    else out.push({ from: d, to: d });
  }
  return out;
}

/** "1.–2. 7., 5. 7." (Czech day.month). */
export function intervalsText(days: string[]): string {
  const dm = (d: string) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}.`;
  return dayIntervals(days)
    .map((i) => (i.from === i.to ? dm(i.from) : i.from.slice(0, 7) === i.to.slice(0, 7) ? `${Number(i.from.slice(8, 10))}.–${dm(i.to)}` : `${dm(i.from)} – ${dm(i.to)}`))
    .join(", ");
}

/** Days at the event (inside its dates). */
export const daysAtEvent = (days: string[], eventStart: string, eventEnd: string) => presentDays(days, eventStart, eventEnd).filter((d) => d >= eventStart.slice(0, 10) && d <= eventEnd.slice(0, 10)).length;

/** One row per adult: age on `ageDate`, address, first / last day, the intervals, days at the event. */
export function adultReportRows(list: AdultAssignment[], eventStart: string, eventEnd: string, ageDate: string): AdultReportRow[] {
  return list.map((a) => {
    const present = presentDays(a.days, eventStart, eventEnd);
    const text = (k: string) => (typeof a.fieldValues?.[k] === "string" ? (a.fieldValues[k] as string) : "");
    return {
      name: a.name,
      dateOfBirth: a.dateOfBirth ? a.dateOfBirth.slice(0, 10) : null,
      age: ageOn(a.dateOfBirth, day(ageDate)),
      municipality: text(ADDRESS_KEYS.municipality),
      zip: text(ADDRESS_KEYS.zip),
      from: present[0] ?? eventStart.slice(0, 10),
      to: present[present.length - 1] ?? eventEnd.slice(0, 10),
      periods: intervalsText(present),
      days: daysAtEvent(a.days, eventStart, eventEnd),
      // Days outside the event's dates (it moved after they were set): a warning, never refused.
      outside: present.some((d) => d < eventStart.slice(0, 10) || d > eventEnd.slice(0, 10)),
    };
  });
}

/** Totals: people, person-days, and how many fall into an optional age range (inclusive; null = open). */
export function reportTotals(rows: AdultReportRow[], ageFrom: number | null, ageTo: number | null) {
  const inRange = rows.filter((r) => r.age != null && (ageFrom == null || r.age >= ageFrom) && (ageTo == null || r.age <= ageTo));
  return { people: rows.length, personDays: rows.reduce((s, r) => s + r.days, 0), inRange: inRange.length, inRangeDays: inRange.reduce((s, r) => s + r.days, 0) };
}

/** CSV for Excel: UTF-8 with BOM, ";" between columns, quotes doubled. */
export function reportCsv(rows: AdultReportRow[], header: string[]): string {
  const cell = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header, ...rows.map((r) => [r.name, r.dateOfBirth, r.age, r.municipality, r.zip, r.from, r.to, r.periods, r.days])].map((l) => l.map(cell).join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
