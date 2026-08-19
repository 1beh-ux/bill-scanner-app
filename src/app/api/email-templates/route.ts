import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateOrgEmailTemplate, PARENT_SUMMARY_PURPOSE_KEY } from "@/lib/email-template";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const purposeKey = req.nextUrl.searchParams.get("purposeKey") || PARENT_SUMMARY_PURPOSE_KEY;
  const template = await getOrCreateOrgEmailTemplate(purposeKey);
  return NextResponse.json(template);
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }

  const { subject, body, purposeKey } = await req.json();
  const key = typeof purposeKey === "string" && purposeKey ? purposeKey : PARENT_SUMMARY_PURPOSE_KEY;
  if (!subject || !body || typeof subject !== "string" || typeof body !== "string") {
    return NextResponse.json({ error: "subject_and_body_required" }, { status: 400 });
  }

  const updated = await prisma.emailTemplate.upsert({
    where: { purposeKey: key },
    update: { subject, body },
    create: { purposeKey: key, subject, body },
  });

  return NextResponse.json(updated);
}
