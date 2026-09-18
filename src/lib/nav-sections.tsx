import type { LucideIcon } from "lucide-react";
import { Calendar, UserCog, LayoutTemplate, Languages, Users, Landmark } from "lucide-react";

export type NavItemDef = { path: string; labelKey: string; icon: LucideIcon; adminOnly?: boolean };
export type NavSectionDef = { sectionLabelKey: string; items: NavItemDef[] };

// Single source of truth for event-independent destinations, shared by
// AppSidebar's "Bills"/"Organization" groups and the personal-settings
// landing-page picker -- add a new org-level page here once and both
// pick it up, instead of keeping two hand-maintained lists in sync.
// Event-scoped pages (import/bills/health/mail/...) intentionally stay
// out of this list: a landing path can't bake in an eventId that would
// go stale once that event closes or access changes.
export const NAV_SECTIONS: Record<"bills" | "organization", NavSectionDef> = {
  bills: {
    sectionLabelKey: "nav.sectionBills",
    items: [
      { path: "/authors", labelKey: "nav.authors", icon: Users },
      { path: "/exchange-rates", labelKey: "nav.exchangeRates", icon: Landmark },
    ],
  },
  organization: {
    sectionLabelKey: "nav.organization",
    items: [
      { path: "/events", labelKey: "nav.events", icon: Calendar },
      { path: "/users", labelKey: "nav.users", icon: UserCog, adminOnly: true },
      { path: "/templates", labelKey: "nav.templates", icon: LayoutTemplate },
      { path: "/translations", labelKey: "nav.translations", icon: Languages, adminOnly: true },
    ],
  },
};

export function visibleNavSections(role: string | null): NavSectionDef[] {
  return Object.values(NAV_SECTIONS)
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.adminOnly || role === "admin") }))
    .filter((s) => s.items.length > 0);
}
