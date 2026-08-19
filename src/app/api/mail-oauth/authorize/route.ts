import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { google } from "googleapis";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

const MAIL_OAUTH_CLIENT_ID = process.env.MAIL_OAUTH_CLIENT_ID;
const MAIL_OAUTH_CLIENT_SECRET = process.env.MAIL_OAUTH_CLIENT_SECRET;
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

// Kicks off the per-mailbox OAuth consent flow: the event's admin clicks
// "Connect", is sent here, and Google redirects the *mailbox owner* (who
// must sign in as the account being connected) to grant gmail.send. State
// is a double-submit cookie rather than a server-side store -- this route
// is stateless and the round trip is a couple of minutes at most.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!MAIL_OAUTH_CLIENT_ID || !MAIL_OAUTH_CLIENT_SECRET) {
    return NextResponse.json({ error: "mail_oauth_not_configured" }, { status: 500 });
  }

  const eventId = req.nextUrl.searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ error: "event_id_required" }, { status: 400 });
  }
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;

  const nonce = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${req.nextUrl.origin}/api/mail-oauth/callback`;
  const oauth2Client = new google.auth.OAuth2(MAIL_OAUTH_CLIENT_ID, MAIL_OAUTH_CLIENT_SECRET, redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: nonce,
  });

  const response = NextResponse.redirect(authUrl);
  // The token exchange in the callback must send back this exact same
  // redirect_uri (OAuth2 spec requirement) -- carry it through the cookie
  // rather than recomputing req.nextUrl.origin in the callback request,
  // since that can resolve differently between the two requests behind a
  // proxy (e.g. Cloud Shell's web preview terminates TLS and can present a
  // different effective origin per request).
  response.cookies.set("mail_oauth_state", `${nonce}|${eventId}|${redirectUri}`, {
    httpOnly: true,
    secure: true,
    maxAge: 600,
    path: "/api/mail-oauth",
  });
  return response;
}
