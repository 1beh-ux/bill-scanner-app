import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { getOrCreateOrgEmailTemplate, PARENT_SUMMARY_PURPOSE_KEY, moduleForEmailPurpose } from "@/lib/email-template";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const purposeKey = req.nextUrl.searchParams.get("purposeKey") || PARENT_SUMMARY_PURPOSE_KEY;
  const denied = await requireModuleAccess(user, eventId, moduleForEmailPurpose(purposeKey));
  if (denied) return denied;

  const override = await prisma.eventEmailTemplate.findUnique({
    where: { eventId_purposeKey: { eventId, purposeKey } },
  });
  if (override) {
    return NextResponse.json({ subject: override.subject, body: override.body, hasOverride: true });
  }

  const org = await getOrCreateOrgEmailTemplate(purposeKey);
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
  const { subject, body, purposeKey: purposeKeyRaw } = await req.json();
  const purposeKey = typeof purposeKeyRaw === "string" && purposeKeyRaw ? purposeKeyRaw : PARENT_SUMMARY_PURPOSE_KEY;
  const denied = await requireModuleAccess(user, eventId, moduleForEmailPurpose(purposeKey));
  if (denied) return denied;

  if (!subject || !body || typeof subject !== "string" || typeof body !== "string") {
    return NextResponse.json({ error: "subject_and_body_required" }, { status: 400 });
  }

  const updated = await prisma.eventEmailTemplate.upsert({
    where: { eventId_purposeKey: { eventId, purposeKey } },
    update: { subject, body },
    create: { eventId, purposeKey, subject, body },
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
  const purposeKey = req.nextUrl.searchParams.get("purposeKey") || PARENT_SUMMARY_PURPOSE_KEY;
  const denied = await requireModuleAccess(user, eventId, moduleForEmailPurpose(purposeKey));
  if (denied) return denied;

  await prisma.eventEmailTemplate.deleteMany({
    where: { eventId, purposeKey },
  });

  const org = await getOrCreateOrgEmailTemplate(purposeKey);
  return NextResponse.json({ subject: org.subject, body: org.body, hasOverride: false });
}
