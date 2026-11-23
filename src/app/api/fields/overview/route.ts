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
import { contactEmail, readContactRule } from "@/lib/contact-email";
import { resolveContactEmail } from "@/lib/document-variables";
import { fieldsManagerAccess, pickEvent } from "../access";

// Redesign R8/R10: what kind of variable it is and where it is changed -- in the panel ("inline", with the raw
// value for the input) or at its own place ("link").
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
type Ev = { name: string; startDate: Date; endDate: Date | null; location: string | null; memberPriceCzk: number | null; nonMemberPriceCzk: number | null; publicContactEmail: string | null; registrationDeadline: Date | null; mailQuestionnaireUrl: string | null };
function variableMeta(key: string, kind: string, e: Ev, eventId: string): { category: "event" | "participant" | "sentence" | "free"; edit: "inline" | "link" | "sentence" | null; href?: string; raw?: string } {
  const at = (tab: string) => `/events/${eventId}?tab=${tab}`;
  const inline: Record<string, string> = { camp_name: e.name, date_from: iso(e.startDate), date_to: iso(e.endDate), place: e.location ?? "", price_member: e.memberPriceCzk?.toString() ?? "", price_nonmember: e.nonMemberPriceCzk?.toString() ?? "", contact_email: e.publicContactEmail ?? "", registration_deadline: iso(e.registrationDeadline), questionnaire_url: e.mailQuestionnaireUrl ?? "" };
  if (kind === "free") return { category: "free", edit: "inline" };
  if (key in inline) return { category: "event", edit: "inline", raw: inline[key] };
  if (key.endsWith("_line")) return { category: "sentence", edit: "sentence" };
  const links: Record<string, [string, "event" | "participant"]> = {
    date_range: [at("akce"), "event"], sender_email: [at("pripojeni"), "event"], organization_name: ["/settings", "event"], bank_account: [at("platba"), "event"],
    participant_name: [`/events/${eventId}/participants`, "participant"], health_notes: [at("zdravi"), "participant"], document_checklist: [at("dokumenty"), "participant"],
    portal_link: [at("portal"), "participant"], details_link: [at("portal"), "participant"], membership_offer_link: [at("lide"), "participant"],
  };
  const l = links[key];
  return l ? { category: l[1], edit: "link", href: l[0] } : { category: "event", edit: null };
}

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
    prisma.participant.findMany({ where: { eventId: selected.id }, select: { customFieldValues: true, isAdult: true, guardians: { select: { email: true, receivesCommunications: true } } } }),
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
  const freeLabels = new Map((await prisma.eventVariable.findMany({ where: { organizationId, OR: [{ eventId: null }, { eventId: selected.id }] }, select: { key: true, label: true, eventId: true }, orderBy: { eventId: { sort: "asc", nulls: "first" } } })).map((v) => [v.key, v.label]));
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
    ...Object.entries(resolver.free).map(([key, value]) => ({ key, label: freeLabels.get(key) ?? key, kind: "free" as const, source: "manager", value })),
  ].map((v) => ({ ...v, ...variableMeta(v.key, v.kind, event, selected.id), aliases: Object.entries(EVENT_VARIABLE_ALIASES).filter(([, t]) => t === v.key).map(([a]) => a) }));

  return NextResponse.json({
    events: events.map((e) => ({ id: e.id, name: e.name, startDate: e.startDate, kind: e.kind, status: e.status })),
    eventId: selected.id,
    guardianSlots: guardianSlots(org.guardianSlots),
    // Hint "contact_missing" (redesign R11): participants with no contact e-mail under the event's rule.
    contactMissing: (() => {
      const f = eventFields.find((x) => x.computedType === "contact_email");
      const rule = (f?.options as { contactRule?: unknown } | null)?.contactRule;
      const emailKeys = eventFields.filter((x) => x.fieldType === "email").map((x) => x.key);
      return participants.filter((p) => {
        const cfv = p.customFieldValues as Record<string, string> | null;
        return !(rule ? contactEmail(readContactRule(rule), { guardians: p.guardians, customFieldValues: cfv }, !!p.isAdult, emailKeys) : resolveContactEmail(p));
      }).length;
    })(),
    reviewCount: await prisma.syncReviewItem.count({ where: { eventId: selected.id, status: "pending" } }),
    aliases,
    variables,
    ...overview,
  });
}
