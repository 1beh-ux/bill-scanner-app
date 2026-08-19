import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { encryptMailToken } from "@/lib/mail-token-crypto";

const MAIL_OAUTH_CLIENT_ID = process.env.MAIL_OAUTH_CLIENT_ID;
const MAIL_OAUTH_CLIENT_SECRET = process.env.MAIL_OAUTH_CLIENT_SECRET;

function redirectToEvent(
  origin: string,
  eventId: string,
  purpose: "health" | "mail",
  result: "connected" | "error"
): NextResponse {
  const target =
    purpose === "mail"
      ? `${origin}/events/${eventId}/mail?mailConnect=${result}`
      : `${origin}/events/${eventId}?tab=health&mailConnect=${result}`;
  const response = NextResponse.redirect(target);
  response.cookies.delete("mail_oauth_state");
  return response;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!MAIL_OAUTH_CLIENT_ID || !MAIL_OAUTH_CLIENT_SECRET) {
    return NextResponse.json({ error: "mail_oauth_not_configured" }, { status: 500 });
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieValue = req.cookies.get("mail_oauth_state")?.value;
  if (!code || !state || !cookieValue) {
    return NextResponse.json({ error: "missing_code_or_state" }, { status: 400 });
  }

  const [cookieNonce, eventId, redirectUri, purposeRaw] = cookieValue.split("|");
  if (!cookieNonce || !eventId || !redirectUri || cookieNonce !== state) {
    return NextResponse.json({ error: "state_mismatch" }, { status: 400 });
  }
  const purpose: "health" | "mail" = purposeRaw === "mail" ? "mail" : "health";
  // Same origin the authorize step actually used (see the cookie comment
  // there) -- req.nextUrl.origin can't be trusted to match it here.
  const origin = new URL(redirectUri).origin;

  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  const oauth2Client = new google.auth.OAuth2(MAIL_OAUTH_CLIENT_ID, MAIL_OAUTH_CLIENT_SECRET, redirectUri);

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      // Shouldn't happen with prompt=consent, but Google can still omit it
      // in edge cases (e.g. re-consenting from an already-fully-granted
      // session) -- fail loudly instead of silently keeping a stale token.
      throw new Error("no_refresh_token_returned");
    }
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email;
    if (!email) throw new Error("no_email_in_userinfo");

    await prisma.mailSenderAccount.upsert({
      where: { email },
      update: {
        refreshTokenEncrypted: encryptMailToken(tokens.refresh_token),
        connectedByUserId: user.id,
        scope: tokens.scope ?? null,
      },
      create: {
        email,
        refreshTokenEncrypted: encryptMailToken(tokens.refresh_token),
        connectedByUserId: user.id,
        scope: tokens.scope ?? null,
      },
    });
    await prisma.event.update({ where: { id: eventId }, data: { senderEmail: email } });

    return redirectToEvent(origin, eventId, purpose, "connected");
  } catch (err) {
    console.error("[mail-oauth] callback failed:", err);
    return redirectToEvent(origin, eventId, purpose, "error");
  }
}
