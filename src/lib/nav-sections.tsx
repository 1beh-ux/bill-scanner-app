import type { LucideIcon } from "lucide-react";
import { Calendar, UserCog, LayoutTemplate, Languages, Users, Landmark, LayoutDashboard, LifeBuoy, Baby, Plug } from "lucide-react";

// superAdminOnly: Překlady, Kurzy -- app-wide, not one organization's (organizations step 2).
export type NavItemDef = { path: string; labelKey: string; icon: LucideIcon; adminOnly?: boolean; superAdminOnly?: boolean };
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
    items: [{ path: "/exchange-rates", labelKey: "nav.exchangeRates", icon: Landmark, adminOnly: true, superAdminOnly: true }],
  },
  organization: {
    sectionLabelKey: "nav.organization",
    items: [
      { path: "/events", labelKey: "nav.events", icon: Calendar, adminOnly: true },
      { path: "/children", labelKey: "nav.children", icon: Baby, adminOnly: true },
      { path: "/admin/overview", labelKey: "nav.adminOverview", icon: LayoutDashboard, adminOnly: true },
      { path: "/users", labelKey: "nav.users", icon: UserCog, adminOnly: true },
      // Global payer list -- admin-only, event-independent (see docs/drive-payers-roles-change-notes.md);
      // moved here from "bills" per retest feedback: admin should see the same event-scoped context
      // as a user, so a global/all-events list belongs with the other org-wide admin pages, not Bills.
      { path: "/authors", labelKey: "nav.authors", icon: Users, adminOnly: true },
      { path: "/templates", labelKey: "nav.templates", icon: LayoutTemplate, adminOnly: true },
      { path: "/translations", labelKey: "nav.translations", icon: Languages, adminOnly: true, superAdminOnly: true },
      // Public hostnames for the registration page / parent portal (docs/custom-domain.md).
      { path: "/connections", labelKey: "nav.connections", icon: Plug, adminOnly: true },
      // For everyone (event organisers too), not just admins.
      { path: "/napoveda", labelKey: "nav.help", icon: LifeBuoy },
    ],
  },
};

export const navItemVisible = (i: { adminOnly?: boolean; superAdminOnly?: boolean }, role: string | null, isSuperAdmin: boolean) =>
  (!i.adminOnly || role === "admin") && (!i.superAdminOnly || isSuperAdmin);

export function visibleNavSections(role: string | null, isSuperAdmin: boolean): NavSectionDef[] {
  return Object.values(NAV_SECTIONS)
    .map((s) => ({ ...s, items: s.items.filter((i) => navItemVisible(i, role, isSuperAdmin)) }))
    .filter((s) => s.items.length > 0);
}
