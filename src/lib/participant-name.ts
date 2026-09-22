// Participant.name stays the maintained full display name (see the schema
// comment); firstName/lastName are the split fields new UI reads/writes.
// Every writer that touches firstName/lastName must also recompute `name`
// from them so old readers (search, exports, {{Name}}) keep working.

export function fullNameFrom(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ");
}

type NamedParticipant = { name: string; firstName?: string | null; lastName?: string | null };

/** "Jméno Příjmení" for running text -- falls back to the stored name if the split isn't done yet. */
export function participantDisplayName(p: NamedParticipant): string {
  return fullNameFrom(p.firstName, p.lastName) || p.name;
}

/** "Příjmení Jméno" for working lists (Part 2: lists show surname first). */
export function participantListName(p: NamedParticipant): string {
  if (p.lastName || p.firstName) return [p.lastName?.trim(), p.firstName?.trim()].filter(Boolean).join(" ");
  return p.name;
}

/**
 * Splits a full name into firstName/lastName for a row that doesn't have the split yet
 * (used by scripts/split-participant-names.ts and the participant import page, Part 6
 * of the participants/settings prompt). Rule: exactly two space-separated tokens, no
 * comma, not ALL-CAPS -> firstName = token 1, lastName = token 2. Anything else (0/1
 * token, 3+ tokens, a comma, ALL-CAPS) is ambiguous: the whole name goes into
 * firstName, lastName stays null -- never guessed.
 */
export function splitFullName(name: string): { firstName: string; lastName: string | null; ambiguous: boolean } {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const tokens = trimmed.split(" ").filter(Boolean);
  const looksAllCaps = trimmed === trimmed.toUpperCase() && /[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(trimmed);
  if (tokens.length === 2 && !trimmed.includes(",") && !looksAllCaps) {
    return { firstName: tokens[0], lastName: tokens[1], ambiguous: false };
  }
  return { firstName: trimmed, lastName: null, ambiguous: true };
}

/** Czech-collation comparator for "sort by surname" (falls back to the full name when unsplit). */
export function compareParticipantsBySurname(a: NamedParticipant, b: NamedParticipant): number {
  const surnameA = a.lastName?.trim() || a.name;
  const surnameB = b.lastName?.trim() || b.name;
  const bySurname = surnameA.localeCompare(surnameB, "cs");
  if (bySurname !== 0) return bySurname;
  return (a.firstName ?? "").localeCompare(b.firstName ?? "", "cs");
}
