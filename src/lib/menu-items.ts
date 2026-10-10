import type { LucideIcon } from "lucide-react";
import { FileText, BarChart3, QrCode, Users, HeartPulse, Pill, Mail, CalendarClock, Library, Upload, FolderCheck, Settings } from "lucide-react";
import { NAV_SECTIONS } from "@/lib/nav-sections";

// Every sidebar destination in one list -- the sidebar builds its sections from
// it and personal settings offers its items as menu favourites (by id).
export type MenuSection = "bills" | "participants" | "health" | "mail" | "planning" | "event" | "organization" | "app";
// roster = the central participant list, reachable with health OR mail.
export type MenuModule = "health" | "mail" | "planning" | "roster";
export type MenuItem = {
  id: string;
  section: MenuSection;
  labelKey: string;
  icon: LucideIcon;
  href: (eventId: string | null) => string;
  module?: MenuModule;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
};

const ev = (path: string) => (eventId: string | null) => (eventId ? `/events/${eventId}${path}` : "/events");

export const MENU_SECTIONS: { id: MenuSection; labelKey: string | null }[] = [
  { id: "bills", labelKey: "nav.sectionBills" },
  { id: "participants", labelKey: "nav.sectionParticipants" },
  { id: "health", labelKey: "nav.sectionHealth" },
  { id: "mail", labelKey: "nav.sectionMail" },
  { id: "planning", labelKey: "nav.sectionPlanning" },
  { id: "event", labelKey: null },
  { id: "organization", labelKey: "nav.organization" },
  { id: "app", labelKey: "nav.sectionApp" },
];

export const MENU_ITEMS: MenuItem[] = [
  { id: "bills", section: "bills", labelKey: "nav.bills", icon: FileText, href: ev("/bills") },
  { id: "budget", section: "bills", labelKey: "nav.budget", icon: BarChart3, href: ev("/budget") },
  { id: "payments", section: "bills", labelKey: "nav.payments", icon: QrCode, href: ev("/payments") },
  { id: "payers", section: "bills", labelKey: "nav.payers", icon: Users, href: ev("/payers") },
  ...NAV_SECTIONS.bills.items.map((i) => ({ id: i.path, section: "bills" as const, labelKey: i.labelKey, icon: i.icon, href: () => i.path, adminOnly: i.adminOnly, superAdminOnly: i.superAdminOnly })),
  { id: "participants", section: "participants", labelKey: "participantsPage.centralTitle", icon: Users, href: ev("/participants"), module: "roster" },
  { id: "participants-import", section: "participants", labelKey: "nav.participantsImport", icon: Upload, href: ev("/participants/import"), module: "roster" },
  { id: "health", section: "health", labelKey: "nav.health", icon: HeartPulse, href: ev("/health"), module: "health" },
  { id: "meds", section: "health", labelKey: "medChecklistPage.title", icon: Pill, href: ev("/health/meds"), module: "health" },
  { id: "mail", section: "mail", labelKey: "nav.mail", icon: Mail, href: ev("/mail"), module: "mail" },
  { id: "documents", section: "mail", labelKey: "participantsPage.mailListTitle", icon: FolderCheck, href: ev("/mail/participants"), module: "mail" },
  { id: "planning", section: "planning", labelKey: "nav.planning", icon: CalendarClock, href: ev("/planning"), module: "planning" },
  { id: "activities", section: "planning", labelKey: "planActivities.title", icon: Library, href: ev("/planning/activities"), module: "planning" },
  { id: "event-settings", section: "event", labelKey: "nav.eventSetup", icon: Settings, href: (id) => (id ? `/events/${id}` : "/events") },
  ...NAV_SECTIONS.organization.items.map((i) => ({ id: i.path, section: "organization" as const, labelKey: i.labelKey, icon: i.icon, href: () => i.path, adminOnly: i.adminOnly, superAdminOnly: i.superAdminOnly })),
  ...NAV_SECTIONS.app.items.map((i) => ({ id: i.path, section: "app" as const, labelKey: i.labelKey, icon: i.icon, href: () => i.path, adminOnly: i.adminOnly, superAdminOnly: i.superAdminOnly })),
];
