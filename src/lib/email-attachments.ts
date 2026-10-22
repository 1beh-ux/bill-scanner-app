// Documents attached to an event's participant e-mails (2026-10-22): per template (purpose key) the
// event's document types (Nastavení akce -> Pošta). A fixed attachment goes as it is, a template is
// generated for each participant (src/lib/participant-bulk-email.ts documentAttachmentsFor). Pure.
import {
  MAIL_HELPER_BULK_STATUS_PURPOSE_KEY,
  PARENT_SUMMARY_PURPOSE_KEY,
  PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY,
  REGISTRATION_ACCEPTANCE_PURPOSE_KEY,
  isCustomPurpose,
} from "@/lib/email-template-purpose-keys";

/** The e-mails that go to a participant's people (and so can carry their documents). */
export const takesAttachments = (purposeKey: string) =>
  isCustomPurpose(purposeKey) || [PARENT_SUMMARY_PURPOSE_KEY, MAIL_HELPER_BULK_STATUS_PURPOSE_KEY, PARTICIPANT_OPEN_EMAIL_PURPOSE_KEY, REGISTRATION_ACCEPTANCE_PURPOSE_KEY].includes(purposeKey);

/** Stored JSON -> { purposeKey: ids } (unknown shapes dropped). */
export function readEmailAttachments(raw: unknown): Record<string, string[]> {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!takesAttachments(k) || !Array.isArray(v)) continue;
    const ids = [...new Set(v.filter((x): x is string => typeof x === "string" && x.length <= 64))].slice(0, 30);
    if (ids.length) out[k] = ids;
  }
  return out;
}

export const attachmentIdsFor = (event: { emailAttachments?: unknown }, purposeKey: string): string[] => readEmailAttachments(event.emailAttachments)[purposeKey] ?? [];
