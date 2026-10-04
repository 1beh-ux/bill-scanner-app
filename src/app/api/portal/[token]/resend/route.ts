import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { portalScope, RESEND_PER_DAY } from "@/lib/portal-server";
import { eventSender } from "@/lib/auto-accept";
import { takeRateSlot } from "@/lib/portal-rate";
import { resolveEmailTemplate } from "@/lib/email-template";
import { REGISTRATION_ACCEPTANCE_PURPOSE_KEY } from "@/lib/email-template-purpose-keys";
import { sendBulkParticipantEmail } from "@/lib/participant-bulk-email";

// "Poslat znovu e-mailem" (docs/registration-slice3-spec.md F): the parent's
// own click re-sends the acceptance e-mail + documents of an ACCEPTED
// registration to its guardians -- the event's template unedited, the same
// send path as "Přijmout a odeslat", logged as usual. Max RESEND_PER_DAY per
// registration. { participantId }
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { scope, error } = await portalScope(token, true);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const participant =
    typeof body.participantId === "string"
      ? await prisma.participant.findUnique({ where: { id: body.participantId }, include: { event: true } })
      : null;
  const ok =
    participant &&
    scope.members.some((m) => m.id === participant.childId) &&
    participant.registrationStatus === "accepted" &&
    participant.event.status === "active" &&
    (participant.event.registrationConnected || participant.event.kind === "membership");
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const sender = await eventSender(participant.event);
  if (!sender) return NextResponse.json({ error: "no_sender" }, { status: 409 });
  if (!(await takeRateSlot(`resend:${participant.id}`, RESEND_PER_DAY, 24 * 3600 * 1000))) return NextResponse.json({ error: "throttled" }, { status: 429 });

  const template = await resolveEmailTemplate(participant.eventId, REGISTRATION_ACCEPTANCE_PURPOSE_KEY);
  const { results } = await sendBulkParticipantEmail({
    eventId: participant.eventId,
    participantIds: [participant.id],
    subject: template.subject,
    body: template.body,
    purposeKey: REGISTRATION_ACCEPTANCE_PURPOSE_KEY,
    sentByUserId: sender.userId,
    markAccepted: true,
  });
  const sent = results.filter((r) => r.status === "sent").length;
  return sent > 0 ? NextResponse.json({ ok: true, sent }) : NextResponse.json({ error: "send_failed" }, { status: 502 });
}
