// Dospělí na akci (2026-10-28): the report of the event's adults (income / subsidies) -- facts only, no amounts.
// Pure, client-safe; the page and the CSV use it. Dates are UTC days (YYYY-MM-DD).
import { ageOn } from "@/lib/age";

// The organization's address fields (profile values, Šablony -> Účastníci) the report reads.
export const ADDRESS_KEYS = { street: "adresa_ulice_cp", municipality: "adresa_mesto", zip: "adresa_psc" } as const;

export type AdultAssignment = {
  name: string;
  dateOfBirth: string | null;
  fieldValues: Record<string, unknown> | null;
  fromDate: string | null;
  toDate: string | null;
};
export type AdultReportRow = { name: string; dateOfBirth: string | null; age: number | null; municipality: string; zip: string; from: string; to: string; days: number; outside: boolean };

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const DAY_MS = 24 * 3600 * 1000;

/** Inclusive days of [from, to] inside the event (null = the event's dates); 0 when it doesn't touch the event. */
export function daysAtEvent(from: string | null, to: string | null, eventStart: string, eventEnd: string): number {
  const s = Math.max(day(from ?? eventStart).getTime(), day(eventStart).getTime());
  const e = Math.min(day(to ?? eventEnd).getTime(), day(eventEnd).getTime());
  return e < s ? 0 : Math.round((e - s) / DAY_MS) + 1;
}

/** One row per adult: age on `ageDate`, address, from–to (the event's when unset), days at the event. */
export function adultReportRows(list: AdultAssignment[], eventStart: string, eventEnd: string, ageDate: string): AdultReportRow[] {
  return list.map((a) => {
    const from = (a.fromDate ?? eventStart).slice(0, 10);
    const to = (a.toDate ?? eventEnd).slice(0, 10);
    const text = (k: string) => (typeof a.fieldValues?.[k] === "string" ? (a.fieldValues[k] as string) : "");
    return {
      name: a.name,
      dateOfBirth: a.dateOfBirth ? a.dateOfBirth.slice(0, 10) : null,
      age: ageOn(a.dateOfBirth, day(ageDate)),
      municipality: text(ADDRESS_KEYS.municipality),
      zip: text(ADDRESS_KEYS.zip),
      from,
      to,
      days: daysAtEvent(a.fromDate, a.toDate, eventStart, eventEnd),
      // Partly or wholly outside the event's dates (a warning, never refused: arrival the day before).
      outside: from < eventStart.slice(0, 10) || to > eventEnd.slice(0, 10),
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
  const lines = [header, ...rows.map((r) => [r.name, r.dateOfBirth, r.age, r.municipality, r.zip, r.from, r.to, r.days])].map((l) => l.map(cell).join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
