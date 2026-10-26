import { NextRequest, NextResponse } from "next/server";
import { participantScope } from "@/lib/participant-link";
import { RESEND_PER_DAY } from "@/lib/portal-server";
import { eventSender } from "@/lib/auto-accept";
import { takeRateSlot } from "@/lib/portal-rate";
import { resolveEmailTemplate } from "@/lib/email-template";
import { REGISTRATION_ACCEPTANCE_PURPOSE_KEY } from "@/lib/email-template-purpose-keys";
import { sendBulkParticipantEmail } from "@/lib/participant-bulk-email";
import { eventTemplateKey } from "@/lib/email-kinds";

// "Poslat znovu e-mailem" on the participant's page: the portal's re-send of the acceptance e-mail + documents. { participantId }
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { p, error } = await participantScope((await params).token, true);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  if (body.participantId !== p.id || p.registrationStatus !== "accepted") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const sender = await eventSender(p.event);
  if (!sender) return NextResponse.json({ error: "no_sender" }, { status: 409 });
  if (!(await takeRateSlot(`resend:${p.id}`, RESEND_PER_DAY, 24 * 3600 * 1000))) return NextResponse.json({ error: "throttled" }, { status: 429 });
  const template = await resolveEmailTemplate(p.eventId, eventTemplateKey(p.event, REGISTRATION_ACCEPTANCE_PURPOSE_KEY));
  const { results } = await sendBulkParticipantEmail({ eventId: p.eventId, participantIds: [p.id], subject: template.subject, body: template.body, purposeKey: REGISTRATION_ACCEPTANCE_PURPOSE_KEY, sentByUserId: sender.userId, markAccepted: true });
  return results.some((r) => r.status === "sent") ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "send_failed" }, { status: 502 });
}
