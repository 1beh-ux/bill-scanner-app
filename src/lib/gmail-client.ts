import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { decryptMailToken } from "@/lib/mail-token-crypto";

const MAIL_OAUTH_CLIENT_ID = process.env.MAIL_OAUTH_CLIENT_ID;
const MAIL_OAUTH_CLIENT_SECRET = process.env.MAIL_OAUTH_CLIENT_SECRET;

// One OAuth2 client per connected mailbox, cached for the life of this
// process -- googleapis' OAuth2 client refreshes its own access token
// transparently from the refresh token, so repeated calls for the same
// sender (sends, bulk sends, inbox reads) don't re-decrypt/re-exchange
// every time. Shared between src/lib/mail.ts (send) and src/lib/mail-read.ts
// (read/reply/archive) so both use the same cached client per mailbox.
const clientsBySender = new Map<string, InstanceType<typeof google.auth.OAuth2>>();

export async function getGmailOAuthClient(senderEmail: string) {
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

  return client;
}

export async function getGmailClient(senderEmail: string) {
  const auth = await getGmailOAuthClient(senderEmail);
  return google.gmail({ version: "v1", auth });
}
