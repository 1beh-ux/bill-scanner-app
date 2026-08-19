import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { MAIL_HELPER_REPLY_PURPOSE_KEY, MAIL_HELPER_BULK_STATUS_PURPOSE_KEY } from "@/lib/email-template";

type LogRow = {
  id: string;
  action: string;
  status: string;
  timestamp: string;
  userDisplayName: string;
  participantName: string | null;
  subject: string | null;
  details: string | null;
};

// Merges MailActionLog (bulk move/delete, attachment saves) with the two
// mail_helper_* ParentEmailLog purpose keys into one newest-first timeline
// -- same shape as the old app's Logs modal.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "mail");
  if (denied) return denied;

  const limit = Math.max(1, Math.min(Number(req.nextUrl.searchParams.get("limit") || 30), 100));

  const [actionLogs, emailLogs] = await Promise.all([
    prisma.mailActionLog.findMany({
      where: { eventId },
      include: { user: true, participant: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.parentEmailLog.findMany({
      where: {
        purposeKey: { in: [MAIL_HELPER_REPLY_PURPOSE_KEY, MAIL_HELPER_BULK_STATUS_PURPOSE_KEY] },
        participant: { eventId },
      },
      include: { sentBy: true, participant: true },
      orderBy: { sentAt: "desc" },
      take: limit,
    }),
  ]);

  const rows: LogRow[] = [
    ...actionLogs.map((l) => ({
      id: l.id,
      action: l.action,
      status: l.status,
      timestamp: l.createdAt.toISOString(),
      userDisplayName: l.user.displayName,
      participantName: l.participant?.name ?? null,
      subject: l.subject,
      details: l.details,
    })),
    ...emailLogs.map((l) => ({
      id: l.id,
      action: l.purposeKey,
      status: l.status === "sent" ? "ok" : "error",
      timestamp: l.sentAt.toISOString(),
      userDisplayName: l.sentBy.displayName,
      participantName: l.participant.name,
      subject: null,
      details: l.errorMessage,
    })),
  ];

  rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return NextResponse.json(rows.slice(0, limit));
}
