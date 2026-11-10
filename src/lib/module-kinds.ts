// Which modules an event of a kind offers (Nastavení akce -> Moduly / Lidé), and how they hang together
// (2026-11-10 "packages"). Pure: the settings page uses it too.
import type { ModuleKey } from "@/generated/prisma";

// "Lidé na akci": Dospělí, Děti (= participants, the roster), Přihláška (public form + payment), Rodičovský portál.
export const PEOPLE_PARTS: ModuleKey[] = ["adults", "participants", "registration", "portal"];

const ALL: ModuleKey[] = ["bills", ...PEOPLE_PARTS, "health", "mail", "planning", "kitchen", "bank", "tickets"];
// A public event (docs/public-event-tickets-spec.md) has no participants; Vstupenky only there. Planning works without groups.
const PUBLIC_EVENT: ModuleKey[] = ["bills", "planning", "bank", "tickets"];

export const modulesOfKind = (kind: string): ModuleKey[] => (kind === "public_event" ? PUBLIC_EVENT : ALL.filter((k) => k !== "tickets"));

// Switches nobody is granted (Nastavení akce -> Přístup leaves them out): Dospělí follows Účtenky / Děti /
// Kuchyně access, Přihláška and Portál are the roster's settings.
const SWITCH_ONLY: ModuleKey[] = ["adults", "registration", "portal"];
export const grantableModules = (kind: string): ModuleKey[] => modulesOfKind(kind).filter((k) => !SWITCH_ONLY.includes(k));

// These work on the children (Děti): turning one on turns Děti on; turning Děti off turns them off.
export const NEEDS_CHILDREN: ModuleKey[] = ["health", "mail", "registration", "portal"];

/** Modules to switch together with `key` -> `enabled` (the dependency rule above), the key itself first. */
export function moduleChanges(key: ModuleKey, enabled: boolean): { key: ModuleKey; enabled: boolean }[] {
  if (enabled && NEEDS_CHILDREN.includes(key)) return [{ key, enabled }, { key: "participants", enabled: true }];
  if (!enabled && key === "participants") return [{ key, enabled }, ...NEEDS_CHILDREN.map((k) => ({ key: k, enabled: false }))];
  return [{ key, enabled }];
}

/** Dospělí na akci is on: its own switch, or Kuchyně (it counts the adults' portions). */
export const adultsOn = (enabled: Set<string> | string[]) => {
  const s = new Set(enabled);
  return s.has("adults") || s.has("kitchen");
};

/** Something on this event sends e-mail, so it needs a mailbox (the readiness checklist). */
export const sendsMail = (enabled: Set<string> | string[]) => ["mail", "registration", "portal", "health", "tickets"].some((k) => new Set(enabled).has(k));
