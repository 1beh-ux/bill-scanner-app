import { getGmailClient } from "@/lib/gmail-client";
import { encodeHeaderValue, base64UrlEncode, chunk76, newMimeBoundary } from "@/lib/mail-mime";

// Gmail sending was originally meant to go through Workspace domain-wide
// delegation (one service account impersonating any mailbox via a signed
// JWT `sub` claim -- see commit 124d9ec for the full keyless-impersonation
// implementation, restorable if this changes), but the Workspace admin
// rejected authorizing that. Falls back to per-mailbox OAuth: each
// Workspace mailbox owner grants gmail.send consent themselves (via
// /api/mail-oauth), and we store their refresh token (see
// MailSenderAccount, encrypted at rest -- src/lib/mail-token-crypto.ts).
// The OAuth2 client cache itself lives in src/lib/gmail-client.ts, shared
// with src/lib/mail-read.ts (Mail Helper's read/reply/archive calls).

function buildRawMessage(opts: {
  to: string;
  fromName: string;
  senderEmail: string;
  subject: string;
  body: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
}): string {
  const boundary = newMimeBoundary("mixed");
  const bodyBase64 = chunk76(Buffer.from(opts.body, "utf-8").toString("base64"));
  const pdfBase64 = chunk76(opts.pdfBuffer.toString("base64"));

  const message = [
    `From: ${encodeHeaderValue(opts.fromName)} <${opts.senderEmail}>`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeaderValue(opts.subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    bodyBase64,
    ``,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${opts.pdfFilename}"`,
    `Content-Disposition: attachment; filename="${opts.pdfFilename}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    pdfBase64,
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  return base64UrlEncode(Buffer.from(message, "utf-8"));
}

export async function sendParentSummaryEmail(opts: {
  to: string;
  fromName: string;
  senderEmail: string;
  subject: string;
  body: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
}): Promise<void> {
  const gmail = await getGmailClient(opts.senderEmail);
  const raw = buildRawMessage(opts);
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}

function buildPlainTextRawMessage(opts: {
  to: string;
  fromName: string;
  senderEmail: string;
  subject: string;
  body: string;
}): string {
  const bodyBase64 = chunk76(Buffer.from(opts.body, "utf-8").toString("base64"));

  const message = [
    `From: ${encodeHeaderValue(opts.fromName)} <${opts.senderEmail}>`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeaderValue(opts.subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    bodyBase64,
  ].join("\r\n");

  return base64UrlEncode(Buffer.from(message, "utf-8"));
}

// Used for Mail Helper's bulk status-update send -- no PDF, just the
// templated status text (see src/lib/mail-bulk-status-send.ts).
export async function sendPlainTextEmail(opts: {
  to: string;
  fromName: string;
  senderEmail: string;
  subject: string;
  body: string;
}): Promise<void> {
  const gmail = await getGmailClient(opts.senderEmail);
  const raw = buildPlainTextRawMessage(opts);
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}

// Generalized version of buildRawMessage's attachment path -- arbitrary
// files (user-uploaded and/or generated, e.g. merged registration
// documents) instead of a hardcoded generated PDF. Used by the
// registration-acceptance and open-email sends (src/lib/participant-bulk-email.ts).
function buildAttachmentsRawMessage(opts: {
  to: string;
  fromName: string;
  senderEmail: string;
  subject: string;
  body: string;
  attachments: { buffer: Buffer; filename: string; mimeType: string }[];
}): string {
  const boundary = newMimeBoundary("mixed");
  const bodyBase64 = chunk76(Buffer.from(opts.body, "utf-8").toString("base64"));

  const attachmentParts = opts.attachments.flatMap((attachment) => [
    `--${boundary}`,
    `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    chunk76(attachment.buffer.toString("base64")),
    ``,
  ]);

  const message = [
    `From: ${encodeHeaderValue(opts.fromName)} <${opts.senderEmail}>`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeaderValue(opts.subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    bodyBase64,
    ``,
    ...attachmentParts,
    `--${boundary}--`,
  ].join("\r\n");

  return base64UrlEncode(Buffer.from(message, "utf-8"));
}

/** Like sendPlainTextEmail, but with zero or more arbitrary files attached. */
export async function sendEmailWithOptionalAttachment(opts: {
  to: string;
  fromName: string;
  senderEmail: string;
  subject: string;
  body: string;
  attachments?: { buffer: Buffer; filename: string; mimeType: string }[];
}): Promise<void> {
  const gmail = await getGmailClient(opts.senderEmail);
  const raw =
    opts.attachments && opts.attachments.length > 0
      ? buildAttachmentsRawMessage({ ...opts, attachments: opts.attachments })
      : buildPlainTextRawMessage(opts);
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}
