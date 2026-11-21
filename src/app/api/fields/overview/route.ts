// GET /api/fields/overview?event=<id> -- the Fields Manager's read-only model for one event (phase 2):
// sources -> fields -> uses, groups, event variables, guardian slots. Admins of a flagged organization only.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildOverview, countValues } from "@/lib/fields-overview";
import { readSyncs } from "@/lib/participant-sync";
import { readProfileSections } from "@/lib/portal-rules";
import { loadResolverContext } from "@/lib/field-resolver";
import { CODE_VARIABLES, LINKED_VARIABLES, EVENT_VARIABLE_ALIASES, formatEventDate } from "@/lib/event-variables";
import { formatDateRange } from "@/lib/document-variables";
import { guardianSlots } from "@/lib/org-features";
import { fieldsManagerAccess, pickEvent } from "../access";

export async function GET(req: NextRequest) {
  const access = await fieldsManagerAccess();
  if ("error" in access) return access.error;
  const { organizationId } = access;
  const { events, selected } = await pickEvent(organizationId, req.nextUrl.searchParams.get("event"));
  if (!selected) return NextResponse.json({ events: [], eventId: null });

  const [org, event, templates, eventFields, aliases, children, participants] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, portalProfileSections: true, guardianSlots: true } }),
    prisma.event.findUniqueOrThrow({ where: { id: selected.id } }),
    prisma.participantFieldTemplate.findMany({ where: { organizationId } }),
    prisma.eventParticipantField.findMany({ where: { eventId: selected.id } }),
    prisma.fieldAlias.findMany({ where: { organizationId }, select: { alias: true, targetKey: true, targetKind: true, reason: true } }),
    prisma.child.findMany({ where: { organizationId }, select: { fieldValues: true } }),
    prisma.participant.findMany({ where: { eventId: selected.id }, select: { customFieldValues: true } }),
  ]);

  const overview = buildOverview({
    templates,
    eventFields,
    syncs: readSyncs(event.participantSyncs),
    aliases,
    profileSections: readProfileSections(org.portalProfileSections),
    profileCounts: countValues(children.map((c) => c.fieldValues as Record<string, unknown> | null)),
    registrationCounts: countValues(participants.map((p) => p.customFieldValues as Record<string, unknown> | null)),
    publicRegistration: event.publicRegistration,
  });

  // Event variables with this event's value where it doesn't depend on the participant.
  const resolver = await loadResolverContext(selected.id);
  const plain: Record<string, string> = {
    camp_name: event.name,
    date_range: event.endDate ? formatDateRange(event.startDate, event.endDate) : formatEventDate(event.startDate),
    sender_email: event.senderEmail ?? "",
    questionnaire_url: event.mailQuestionnaireUrl ?? "",
    registration_deadline: formatEventDate(event.registrationDeadline),
    organization_name: org.name,
  };
  const variables = [
    ...CODE_VARIABLES.map((v) => ({ ...v, value: v.key in plain ? plain[v.key] : null })),
    ...LINKED_VARIABLES.map((v) => ({ ...v, value: resolver.linked[v.key] ?? "" })),
    ...Object.entries(resolver.free).map(([key, value]) => ({ key, label: key, kind: "free" as const, source: "manager", value })),
  ].map((v) => ({ ...v, aliases: Object.entries(EVENT_VARIABLE_ALIASES).filter(([, t]) => t === v.key).map(([a]) => a) }));

  return NextResponse.json({
    events: events.map((e) => ({ id: e.id, name: e.name, startDate: e.startDate, kind: e.kind, status: e.status })),
    eventId: selected.id,
    guardianSlots: guardianSlots(org.guardianSlots),
    aliases,
    variables,
    ...overview,
  });
}
