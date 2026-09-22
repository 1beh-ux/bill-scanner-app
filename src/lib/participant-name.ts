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

/** Czech-collation comparator for "sort by surname" (falls back to the full name when unsplit). */
export function compareParticipantsBySurname(a: NamedParticipant, b: NamedParticipant): number {
  const surnameA = a.lastName?.trim() || a.name;
  const surnameB = b.lastName?.trim() || b.name;
  const bySurname = surnameA.localeCompare(surnameB, "cs");
  if (bySurname !== 0) return bySurname;
  return (a.firstName ?? "").localeCompare(b.firstName ?? "", "cs");
}
