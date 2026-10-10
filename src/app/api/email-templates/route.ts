import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateOrgEmailTemplate, PARENT_SUMMARY_PURPOSE_KEY } from "@/lib/email-template";
import { templateScope } from "@/lib/template-scope";

// The organization's e-mail template for a purpose, or with ?level=app the app's (super-admin).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const scope = await templateScope(req, user, false);
  if ("error" in scope) return scope.error;

  const purposeKey = req.nextUrl.searchParams.get("purposeKey") || PARENT_SUMMARY_PURPOSE_KEY;
  const template = await getOrCreateOrgEmailTemplate(scope.organizationId, purposeKey);
  return NextResponse.json(template);
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const scope = await templateScope(req, user, true);
  if ("error" in scope) return scope.error;

  const { subject, body, purposeKey } = await req.json();
  const key = typeof purposeKey === "string" && purposeKey ? purposeKey : PARENT_SUMMARY_PURPOSE_KEY;
  if (!subject || !body || typeof subject !== "string" || typeof body !== "string") {
    return NextResponse.json({ error: "subject_and_body_required" }, { status: 400 });
  }

  const current = await getOrCreateOrgEmailTemplate(scope.organizationId, key);
  const updated = await prisma.emailTemplate.update({ where: { id: current.id }, data: { subject, body } });
  return NextResponse.json(updated);
}
