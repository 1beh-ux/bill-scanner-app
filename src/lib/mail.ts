import crypto from "crypto";
import { GoogleAuth } from "google-auth-library";
import { google } from "googleapis";

// Gmail sending needs real Workspace domain-wide delegation (impersonating a
// Workspace mailbox via a signed JWT `sub` claim), which is a different
// mechanism from src/lib/drive.ts's `Impersonated` class (plain GCP
// service-account impersonation, no Workspace involvement).
//
// No exported SA key exists or ever will -- org policy
// (constraints/iam.disableServiceAccountKeyCreation) forbids it. Instead the
// domain-wide-delegation JWT is signed remotely via the IAM Credentials
// API's `signJwt`, then exchanged for an access token through the standard
// OAuth2 JWT-bearer grant. Whatever identity this code runs as (the Cloud
// Run runtime SA in prod, the local dev gcloud identity here) only needs
// `roles/iam.serviceAccountTokenCreator` on MAIL_SA_EMAIL -- it never sees
// a private key.
const MAIL_SA_EMAIL = process.env.MAIL_SERVICE_ACCOUNT_EMAIL;
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const TOKEN_LIFETIME_SECONDS = 3600;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

let callerAuth: GoogleAuth | null = null;

function getCallerAuth(): GoogleAuth {
  if (!callerAuth) {
    callerAuth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  }
  return callerAuth;
}

async function getIamCredentialsClient() {
  const auth = getCallerAuth();
  // Same structural-vs-nominal type mismatch as drive.ts's `Impersonated`
  // cast: googleapis bundles its own google-auth-library copy.
  return google.iamcredentials({ version: "v1", auth: auth as any });
}

/** Requests a signed domain-wide-delegation JWT for `senderEmail`, then exchanges it for a Gmail-scoped access token. */
async function fetchAccessTokenForSender(senderEmail: string): Promise<string> {
  if (!MAIL_SA_EMAIL) throw new Error("MAIL_SERVICE_ACCOUNT_EMAIL is not set");

  const iam = await getIamCredentialsClient();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const jwtPayload = {
    iss: MAIL_SA_EMAIL,
    scope: GMAIL_SEND_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    sub: senderEmail,
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_LIFETIME_SECONDS,
  };

  const signRes = await iam.projects.serviceAccounts.signJwt({
    name: `projects/-/serviceAccounts/${MAIL_SA_EMAIL}`,
    requestBody: { payload: JSON.stringify(jwtPayload) },
  });
  const signedJwt = signRes.data.signedJwt;
  if (!signedJwt) throw new Error("signJwt returned no signedJwt");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`oauth2 token exchange failed (${tokenRes.status}): ${await tokenRes.text()}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token: string };
  return tokenJson.access_token;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

// Every event impersonates its own Workspace mailbox (Event.senderEmail), so
// the access token is cached per sender rather than once globally --
// domain-wide delegation authorizes the whole domain, so any mailbox in it
// is a valid `sub` claim, no per-address setup needed on the Google side.
const tokensBySender = new Map<string, CachedToken>();

async function getGmailClient(senderEmail: string) {
  const cached = tokensBySender.get(senderEmail);
  const now = Date.now();

  let accessToken: string;
  if (cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_MS > now) {
    accessToken = cached.accessToken;
  } else {
    accessToken = await fetchAccessTokenForSender(senderEmail);
    tokensBySender.set(senderEmail, { accessToken, expiresAt: now + TOKEN_LIFETIME_SECONDS * 1000 });
  }

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth: oauth2Client });
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
