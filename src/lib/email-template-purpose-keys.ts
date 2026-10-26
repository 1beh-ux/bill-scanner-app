// Pure string constants, deliberately with NO other imports. Email-template
// purpose keys are referenced from both server code (src/lib/email-template.ts,
// which imports prisma) and client components (EmailTemplateAdmin,
// TemplatePreviewModal, the event settings page) -- a client component
// importing them from email-template.ts would pull prisma's `pg` driver
// (and its Node-only `dns` dependency) into the browser bundle. Client code
// must import from this file, never from email-template.ts directly.
export const PARENT_SUMMARY_PURPOSE_KEY = "parent_health_summary";
export const MAIL_HELPER_BULK_STATUS_PURPOSE_KEY = "mail_helper_bulk_status_update";
// Its variant with the link where to fill in / upload / pay (2026-10-26): the family portal for members,
// the participant's own page for others ({{details_link_line}}). Picked on the status update page.
export const MAIL_HELPER_BULK_STATUS_LINK_PURPOSE_KEY = "mail_helper_bulk_status_link";
export const MAIL_HELPER_REPLY_PURPOSE_KEY = "mail_helper_reply";
// Sent once per participant, when an admin decides to accept a registration
// (see docs/registration-workflow.md). Editable template like the others.
export const REGISTRATION_ACCEPTANCE_PURPOSE_KEY = "registration_acceptance";
// The acceptance for a participant NOT in Členové of a portal event (2026-10-26): sent instead of the one
// above (same send, same log key) -- tells them about their own page /u/<token> ({{details_link}}).
export const REGISTRATION_ACCEPTANCE_PAGE_PURPOSE_KEY = "registration_acceptance_page";
// Not a stored/editable template -- an admin types fresh subject/body every
// time for the "open email to selected participants" feature. Used only as
// a ParentEmailLog.purposeKey tag so these sends are distinguishable from
// the others in the action log.
export const PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY = "participant_open_email";
// The parent portal link of one child (docs/registration-portal-spec.md F),
// sent from the Děti page / child detail -- org-level, no event. Editable org
// default at Šablony -> Zdraví -> E-mail.
export const PORTAL_LINK_PURPOSE_KEY = "portal_link";
// Yearly invitation / onboarding existing people into the portal (slice 4
// #12): the same send as PORTAL_LINK, another org template to pick on the
// compose page. Editable at Šablony -> Zdraví -> E-mail.
export const PORTAL_INVITATION_PURPOSE_KEY = "portal_invitation";
// Own e-mail templates (organization or event): any name, sent from Poslat e-mail
// to picked participants like the open e-mail -- same variables, same send.
export const CUSTOM_PURPOSE_PREFIX = "custom_";
export const isCustomPurpose = (purposeKey: string) => purposeKey.startsWith(CUSTOM_PURPOSE_PREFIX);
// Veřejná akce (docs/public-event-tickets-spec.md): sent automatically to the buyer -- the order with
// payment details + QR, the tickets PDF once paid, a cancellation. TICKET_DOCUMENT is the ticket page
// itself (markdown, one page per ticket, src/lib/tickets-pdf.ts) -- body only.
export const TICKET_ORDER_PURPOSE_KEY = "ticket_order";
export const TICKET_SEND_PURPOSE_KEY = "ticket_send";
export const TICKET_CANCEL_PURPOSE_KEY = "ticket_cancel";
export const TICKET_DOCUMENT_PURPOSE_KEY = "ticket_document";
export const isTicketPurpose = (purposeKey: string) => purposeKey.startsWith("ticket_");
