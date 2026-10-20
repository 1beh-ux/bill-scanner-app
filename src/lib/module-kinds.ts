// Which modules an event of a kind offers (Nastavení akce -> Moduly / Lidé). Pure: the settings page uses it too.
import type { ModuleKey } from "@/generated/prisma";

const ALL: ModuleKey[] = ["bills", "participants", "health", "mail", "planning", "bank", "tickets"];
// A public event (docs/public-event-tickets-spec.md) has no participants; Vstupenky only there. Planning works without groups.
const PUBLIC_EVENT: ModuleKey[] = ["bills", "planning", "bank", "tickets"];

export const modulesOfKind = (kind: string): ModuleKey[] => (kind === "public_event" ? PUBLIC_EVENT : ALL.filter((k) => k !== "tickets"));
