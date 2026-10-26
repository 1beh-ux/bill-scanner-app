import { NextRequest, NextResponse } from "next/server";
import { detailsDocuments } from "@/lib/details-documents";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { allowedParticipantFieldKeys, requireAnyModuleAccess } from "@/lib/module-access";
import { getActiveDocumentTypes, getReceivedItemIds } from "@/lib/mail-helper-context";
import { documentDisplayName } from "@/lib/mail-reply-template";
import { resolveContactEmail, fieldTextValues, confirmedMembershipKey, membershipDisplay } from "@/lib/document-variables";
import { withMembers } from "@/lib/children";
import { profileDocuments } from "@/lib/person-documents";

// Lean, mail-scoped roster read -- deliberately NOT the full
// /api/events/[id]/participants route, which carries health-only fields
// that a mail-only grant must never see. Health notes and every other
// custom field now share one JSON blob (Participant.customFieldValues),
// so unlike before the DB query alone can't exclude them -- this strips
// customFieldValues down to only keys whose field is flagged for the
// mail_list surface before the response goes out. Used for participant
// auto-detection/override in the inbox detail panel, the bulk
// status-update roster, and the Mail participants list (name/age/
// acceptance/per-document-type status/mail_list custom columns).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  // Dokumenty lives under Účastníci now: health or mail, like the roster.
  const denied = await requireAnyModuleAccess(user, eventId, ["participants", "health", "mail"]);
  if (denied) return denied;

  const withDocs = new URL(req.url).searchParams.get("withDocuments") === "1";

  const [activeFields, event] = await Promise.all([
    prisma.eventParticipantField.findMany({ where: { eventId, active: true } }),
    prisma.event.findUniqueOrThrow({ where: { id: eventId } }).then(withMembers),
  ]);
  // The documents overview offers the participant list's fields too (2026-10-27): "Seznam" or "Přehled dokumentů",
  // as far as this user may see them (the roster's rule).
  const visible = await allowedParticipantFieldKeys(user, eventId);
  const mailListFields = activeFields.filter((f) => (f.surfaces.includes("mail_list") || f.surfaces.includes("list")) && visible.has(f.key));
  const allowedKeys = new Set(mailListFields.map((f) => f.key));
  // Composite fields are computed, not stored -- added so they work as columns.
  // Composite and calculated fields aren't stored -- computed for the columns (not the QR image).
  const composites = mailListFields.filter((f) => f.fieldType === "composite" || (f.kind === "computed" && f.fieldType !== "image"));

  const participants = await prisma.participant.findMany({
    where: { eventId, active: true },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      registrationStatus: true,
      customFieldValues: true,
      guardians: {
        select: { id: true, name: true, email: true, relationship: true, phone: true, receivesCommunications: true },
      },
      registrationNumber: true,
      groupName: true,
      childId: true,
      isAdult: true,
      priceCategory: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });

  const scoped = participants.map((p) => {
    const custom = (p.customFieldValues as Record<string, string> | null) ?? {};
    const values = composites.length > 0 ? fieldTextValues({ ...p, customFieldValues: custom }, event, activeFields) : {};
    const { childId, ...row } = p;
    // Membership confirmed by the membership event shows as "Ano" (display only).
    const confirmedKey = confirmedMembershipKey({ childId }, event);
    const membership = membershipDisplay({ ...p, customFieldValues: custom }, event);
    return {
      ...row,
      contactEmail: resolveContactEmail(p),
      customFieldValues: {
        ...Object.fromEntries(Object.entries(custom).filter(([key]) => allowedKeys.has(key))),
        ...Object.fromEntries(composites.map((f) => [f.key, values[f.key] ?? ""])),
        ...(membership && allowedKeys.has(membership.key) ? { [membership.key]: membership.value } : confirmedKey && allowedKeys.has(confirmedKey) && { [confirmedKey]: "Ano" }),
      },
    };
  });

  if (!withDocs) return NextResponse.json(scoped);

  const documentTypes = await getActiveDocumentTypes(eventId);
  // Received through the person's permanent document (slice 6 #4): shown, not toggled.
  const fromProfile = await profileDocuments(participants.map((p) => ({ id: p.id, eventId, childId: p.childId })));
  // Filled in by the details ("Splněno vyplněním podrobných údajů"): shown, not toggled either.
  const fromDetails = await detailsDocuments(participants.map((p) => p.id));
  // Payments confirmed from the bank: "Doručeno · banka" + date and amount in the tooltip.
  const bank = new Map(
    (await prisma.bankMovement.findMany({
      where: { status: "settled", participantId: { in: participants.map((p) => p.id) }, participantDocument: { isNot: null } },
      select: { participantId: true, bookedAt: true, amount: true, participantDocument: { select: { eventListItemId: true } } },
    })).map((m) => [`${m.participantId}:${m.participantDocument!.eventListItemId}`, { date: m.bookedAt, amount: Number(m.amount) }])
  );
  const withDocuments = await Promise.all(
    scoped.map(async (p) => {
      const receivedItemIds = await getReceivedItemIds(p.id);
      return {
        ...p,
        documents: documentTypes.map((d) => ({
          eventListItemId: d.id,
          name: documentDisplayName(d),
          received: receivedItemIds.has(d.id),
          fromProfile: !!fromProfile.get(p.id)?.some((c) => c.eventListItemId === d.id),
          fromDetails: !!fromDetails.get(p.id)?.some((c) => c.eventListItemId === d.id),
          bank: receivedItemIds.has(d.id) ? (bank.get(`${p.id}:${d.id}`) ?? null) : null,
        })),
      };
    })
  );

  return NextResponse.json(withDocuments);
}
