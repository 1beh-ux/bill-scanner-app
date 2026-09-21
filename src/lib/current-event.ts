// Which event the sidebar switcher shows as selected.
//
// The choice is remembered in localStorage (see I18nProvider) so it survives a
// reload and stays put on organisation pages (Kurzy, Plátci, ...) instead of
// snapping back to the first event. What was remembered may no longer be valid,
// so it is checked every time against the events this user can actually reach:
// it must exist in the accessible list and be active -- unless the user is looking
// at that very event right now (an admin can open a closed one from the events page),
// in which case it stays selectable so the switcher never goes blank.
export type SwitcherEvent = { id: string; status: string };

export function selectableEvents<T extends SwitcherEvent>(events: T[], pathEventId: string | null | undefined): T[] {
  return events.filter((e) => e.status === "active" || e.id === pathEventId);
}

export function pickCurrentEvent(events: SwitcherEvent[], storedId: string | null, pathEventId: string | null | undefined): string | null {
  const list = selectableEvents(events, pathEventId);
  if (storedId && list.some((e) => e.id === storedId)) return storedId;
  return list[0]?.id ?? null;
}
