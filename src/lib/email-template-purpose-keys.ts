// Pure string constants, deliberately with NO other imports. Email-template
// purpose keys are referenced from both server code (src/lib/email-template.ts,
// which imports prisma) and client components (EmailTemplateAdmin,
// TemplatePreviewModal, the event settings page) -- a client component
// importing them from email-template.ts would pull prisma's `pg` driver
// (and its Node-only `dns` dependency) into the browser bundle. Client code
// must import from this file, never from email-template.ts directly.
export const PARENT_SUMMARY_PURPOSE_KEY = "parent_health_summary";
export const MAIL_HELPER_BULK_STATUS_PURPOSE_KEY = "mail_helper_bulk_status_update";
export const MAIL_HELPER_REPLY_PURPOSE_KEY = "mail_helper_reply";
// Sent once per participant, when an admin decides to accept a registration
// (see docs/registration-workflow.md). Editable template like the others.
export const REGISTRATION_ACCEPTANCE_PURPOSE_KEY = "registration_acceptance";
// Not a stored/editable template -- an admin types fresh subject/body every
// time for the "open email to selected participants" feature. Used only as
// a ParentEmailLog.purposeKey tag so these sends are distinguishable from
// the others in the action log.
export const PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY = "participant_open_email";
