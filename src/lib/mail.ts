import crypto from "crypto";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { decryptMailToken } from "@/lib/mail-token-crypto";

// Gmail sending was originally meant to go through Workspace domain-wide
// delegation (one service account impersonating any mailbox via a signed
// JWT `sub` claim -- see commit 124d9ec for the full keyless-impersonation
// implementation, restorable if this changes), but the Workspace admin
// rejected authorizing that. Falls back to per-mailbox OAuth: each
// Workspace mailbox owner grants gmail.send consent themselves (via
// /api/mail-oauth), and we store their refresh token (see
// MailSenderAccount, encrypted at rest -- src/lib/mail-token-crypto.ts).
const MAIL_OAUTH_CLIENT_ID = process.env.MAIL_OAUTH_CLIENT_ID;
const MAIL_OAUTH_CLIENT_SECRET = process.env.MAIL_OAUTH_CLIENT_SECRET;

// One OAuth2 client per connected mailbox, cached for the life of this
// process -- googleapis' OAuth2 client refreshes its own access token
// transparently from the refresh token, so repeated sends to the same
// sender (e.g. a bulk send) don't re-decrypt/re-exchange every time.
const clientsBySender = new Map<string, InstanceType<typeof google.auth.OAuth2>>();

async function getGmailClient(senderEmail: string) {
  if (!MAIL_OAUTH_CLIENT_ID || !MAIL_OAUTH_CLIENT_SECRET) {
    throw new Error("MAIL_OAUTH_CLIENT_ID / MAIL_OAUTH_CLIENT_SECRET is not set");
  }

  let client = clientsBySender.get(senderEmail);
  if (!client) {
    const account = await prisma.mailSenderAccount.findUnique({ where: { email: senderEmail } });
    if (!account) throw new Error("sender_not_connected");

    client = new google.auth.OAuth2(MAIL_OAUTH_CLIENT_ID, MAIL_OAUTH_CLIENT_SECRET);
    client.setCredentials({ refresh_token: decryptMailToken(account.refreshTokenEncrypted) });
    clientsBySender.set(senderEmail, client);
  }

  return google.gmail({ version: "v1", auth: client });
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
