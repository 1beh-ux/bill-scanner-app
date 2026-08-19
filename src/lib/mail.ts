import crypto from "crypto";
import { google } from "googleapis";

// Gmail sending needs real Workspace domain-wide delegation (impersonating a
// fixed mailbox via a signed JWT `sub` claim), which is a different
// mechanism from src/lib/drive.ts's `Impersonated` (plain GCP service-account
// impersonation, no Workspace involvement) -- that's why this has its own
// auth path instead of reusing getDriveClient()'s pattern.
const MAIL_SA_KEY_JSON = process.env.MAIL_SA_KEY_JSON;

// Every event impersonates its own Workspace mailbox (Event.senderEmail), so
// the client is cached per sender rather than once globally -- domain-wide
// delegation authorizes the whole domain, so any mailbox in it is a valid
// `sub` claim, no per-address setup needed on the Google side.
const gmailClientsBySender = new Map<string, ReturnType<typeof buildGmailClient>>();

function buildGmailClient(senderEmail: string) {
  if (!MAIL_SA_KEY_JSON) throw new Error("MAIL_SA_KEY_JSON is not set");
  const credentials = JSON.parse(MAIL_SA_KEY_JSON);
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    subject: senderEmail,
  });
  return Promise.resolve(google.gmail({ version: "v1", auth }));
}

function getGmailClient(senderEmail: string) {
  let clientPromise = gmailClientsBySender.get(senderEmail);
  if (!clientPromise) {
    clientPromise = buildGmailClient(senderEmail);
    gmailClientsBySender.set(senderEmail, clientPromise);
  }
  return clientPromise;
}

function encodeHeaderValue(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function chunk76(base64: string): string {
  return base64.replace(/(.{76})/g, "$1\r\n");
}

function buildRawMessage(opts: {
  to: string;
  fromName: string;
  senderEmail: string;
  subject: string;
  body: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
}): string {
  const boundary = `mixed_${crypto.randomBytes(12).toString("hex")}`;
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
