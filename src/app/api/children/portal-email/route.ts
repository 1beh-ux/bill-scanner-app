import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateOrgEmailTemplate } from "@/lib/email-template";
import { PORTAL_LINK_PURPOSE_KEY } from "@/lib/email-template-purpose-keys";
import { orgSenderEmail, previewPortalEmail, sendPortalLinks } from "@/lib/portal-email";

// The "send portal link" compose page (/children/compose), admin only.
// action "info" { childIds }: org template, sending mailbox, recipients per child;
// "preview" { childId, subject, body }: one child's e-mail filled in, nothing sent/created;
// "send" { childIds, subject, body }: the actual send -- only from the page's
// explicit confirm, never automatic.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "admin_only" }, { status: 403 });
  const body = await req.json();
  const childIds: string[] = Array.isArray(body.childIds) ? body.childIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 2000) : [];

  if (body.action === "info") {
    const [template, senderEmail, children] = await Promise.all([
      getOrCreateOrgEmailTemplate(PORTAL_LINK_PURPOSE_KEY),
      orgSenderEmail(user),
      prisma.child.findMany({
        where: { id: { in: childIds } },
        select: { id: true, name: true, guardians: { where: { receivesCommunications: true }, select: { email: true } } },
        orderBy: [{ lastName: "asc" }, { name: "asc" }],
      }),
    ]);
    return NextResponse.json({
      subject: template.subject,
      body: template.body,
      senderEmail,
      children: children.map((c) => ({ id: c.id, name: c.name, emails: c.guardians.map((g) => g.email) })),
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
      return NextResponse.json(await sendPortalLinks({ childIds, subject: body.subject, body: body.body, user, req }));
    } catch (err) {
      if (err instanceof Error && err.message === "sender_not_connected") return NextResponse.json({ error: "sender_not_connected" }, { status: 400 });
      throw err;
    }
  }

  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
