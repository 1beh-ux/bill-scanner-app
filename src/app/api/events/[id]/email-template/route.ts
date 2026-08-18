import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { getOrCreateOrgEmailTemplate, PARENT_SUMMARY_PURPOSE_KEY } from "@/lib/email-template";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;

  const override = await prisma.eventEmailTemplate.findUnique({
    where: { eventId_purposeKey: { eventId, purposeKey: PARENT_SUMMARY_PURPOSE_KEY } },
  });
  if (override) {
    return NextResponse.json({ subject: override.subject, body: override.body, hasOverride: true });
  }

  const org = await getOrCreateOrgEmailTemplate();
  return NextResponse.json({ subject: org.subject, body: org.body, hasOverride: false });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;

  const { subject, body } = await req.json();
  if (!subject || !body || typeof subject !== "string" || typeof body !== "string") {
    return NextResponse.json({ error: "subject_and_body_required" }, { status: 400 });
  }

  const updated = await prisma.eventEmailTemplate.upsert({
    where: { eventId_purposeKey: { eventId, purposeKey: PARENT_SUMMARY_PURPOSE_KEY } },
    update: { subject, body },
    create: { eventId, purposeKey: PARENT_SUMMARY_PURPOSE_KEY, subject, body },
  });

  return NextResponse.json({ subject: updated.subject, body: updated.body, hasOverride: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;

  await prisma.eventEmailTemplate.deleteMany({
    where: { eventId, purposeKey: PARENT_SUMMARY_PURPOSE_KEY },
  });

  const org = await getOrCreateOrgEmailTemplate();
  return NextResponse.json({ subject: org.subject, body: org.body, hasOverride: false });
}
