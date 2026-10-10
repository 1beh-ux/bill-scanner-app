import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateOrgEmailTemplate } from "@/lib/email-template";
import { orgIdOfUser } from "@/lib/org-owner";
import { PORTAL_INVITATION_PURPOSE_KEY, PORTAL_LINK_PURPOSE_KEY } from "@/lib/email-template-purpose-keys";
import { loadTarget, orgSenderEmail, previewPortalEmail, sendPortalLinks } from "@/lib/portal-email";

// The "send portal link" compose page (/children/compose), admin only.
// childIds: child ids and/or "family:<id>" (a family's link, slice 3 B).
// action "info" { childIds, purposeKey? }: org template (portal_link, or the
// yearly invitation portal_invitation -- slice 4 #12), sending mailbox, recipients per target;
// "preview" { childId, subject, body }: one child's e-mail filled in, nothing sent/created;
// "send" { childIds, subject, body }: the actual send -- only from the page's
// explicit confirm, never automatic.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "admin_only" }, { status: 403 });
  const body = await req.json();
  const childIds: string[] = Array.isArray(body.childIds) ? body.childIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 2000) : [];
  const purposeKey = body.purposeKey === PORTAL_INVITATION_PURPOSE_KEY ? PORTAL_INVITATION_PURPOSE_KEY : PORTAL_LINK_PURPOSE_KEY;

  if (body.action === "info") {
    const [template, senderEmail, targets] = await Promise.all([
      getOrCreateOrgEmailTemplate(orgIdOfUser(user), purposeKey),
      orgSenderEmail(user),
      Promise.all(childIds.map(loadTarget)),
    ]);
    return NextResponse.json({
      subject: template.subject,
      body: template.body,
      senderEmail,
      children: targets.flatMap((c) => (c ? [{ id: c.id, name: c.name, emails: c.emails }] : [])),
      // Targets left out -- inactive people / families with no active member (slice 8 #2).
      skipped: targets.filter((c) => !c).length,
    });
  }

  if (typeof body.subject !== "string" || typeof body.body !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });

  if (body.action === "preview") {
    const preview = await previewPortalEmail({
      childId: String(body.childId),
      subject: body.subject,
      body: body.body,
      user,
      req,
      noLinkYet: typeof body.noLinkYet === "string" ? body.noLinkYet : "",
    });
    return preview ? NextResponse.json(preview) : NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (body.action === "send") {
    if (!body.subject.trim() || !body.body.trim() || childIds.length === 0) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    try {
      return NextResponse.json(await sendPortalLinks({ childIds, subject: body.subject, body: body.body, user, req, purposeKey }));
    } catch (err) {
      if (err instanceof Error && err.message === "sender_not_connected") return NextResponse.json({ error: "sender_not_connected" }, { status: 400 });
      throw err;
    }
  }

  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
