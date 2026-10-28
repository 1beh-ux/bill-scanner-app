// Who eats at (date, slot) and how many standard adult portions that is (docs/kitchen-planning-design.md).
// Pure. Dates are UTC days "YYYY-MM-DD"; slot ids are the event's kitchen_slot items.
import { ageOn } from "@/lib/age";

export type Band = { ageFrom: number; ageTo: number | null; factor: number };
export type Absence = { date: string; slotId: string | null };
export type HcParticipant = { id: string; name: string; dateOfBirth: string | null; active: boolean; accepted: boolean; absences: Absence[] };
export type HcAdult = { id: string; name: string; dateOfBirth: string | null; eats: boolean; from: string | null; to: string | null; absences: Absence[] };
export type HcAdjust = { from: string; to: string; slotId: string | null; count: number; factor: number; label: string };

/** The band factor for an age (null = no birth date -> 1.0); an age no band covers -> 1.0. */
export function bandFactor(bands: Band[], age: number | null): number {
  if (age == null) return 1;
  return bands.find((b) => age >= b.ageFrom && (b.ageTo == null || age <= b.ageTo))?.factor ?? 1;
}

const absent = (list: Absence[], date: string, slotId: string) => list.some((a) => a.date === date && (a.slotId == null || a.slotId === slotId));

/**
 * Everyone present at (date, slot): participants (active; accepted when countOnlyAccepted), adults who eat here
 * within their from–to (null = the event's dates), minus absences; plus the anonymous adjustments (count × factor).
 * portions = Σ factors (age on the meal date); missingDob = people counted at 1.0 for lack of a birth date.
 */
export function headcount(
  date: string,
  slotId: string,
  o: { eventStart: string; eventEnd: string; bands: Band[]; countOnlyAccepted: boolean; participants: HcParticipant[]; adults: HcAdult[]; adjusts: HcAdjust[] }
) {
  const on = new Date(`${date}T00:00:00Z`);
  const kids = o.participants.filter((p) => p.active && (!o.countOnlyAccepted || p.accepted) && !absent(p.absences, date, slotId));
  const adults = o.adults.filter((a) => a.eats && (a.from ?? o.eventStart) <= date && date <= (a.to ?? o.eventEnd) && !absent(a.absences, date, slotId));
  const people = [...kids.map((p) => ({ kind: "participant" as const, id: p.id, name: p.name, dob: p.dateOfBirth })), ...adults.map((a) => ({ kind: "adult" as const, id: a.id, name: a.name, dob: a.dateOfBirth }))].map((p) => ({ ...p, factor: bandFactor(o.bands, ageOn(p.dob, on)) }));
  const adjusts = o.adjusts.filter((x) => x.from <= date && date <= x.to && (x.slotId == null || x.slotId === slotId));
  const extra = adjusts.reduce((s, x) => s + x.count, 0);
  const portions = people.reduce((s, p) => s + p.factor, 0) + adjusts.reduce((s, x) => s + x.count * x.factor, 0);
  return {
    people,
    participants: kids.length,
    adults: adults.length,
    extra,
    eaters: kids.length + adults.length + extra,
    portions: Math.round(portions * 100) / 100,
    missingDob: people.filter((p) => !p.dob).length,
  };
}
