import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess, allowedParticipantFieldKeys } from "@/lib/module-access";
import { getActiveDocumentTypes } from "@/lib/mail-helper-context";
import { profileDocuments } from "@/lib/person-documents";
import { countsAsReceived, registrationState, requiredEmpty, type ReviewStatus } from "@/lib/registration-status";
import { profileValues } from "@/lib/portal-rules";
import { templateRules } from "@/lib/portal-server";
import { appliesTo, askedFields, askedMissing } from "@/lib/registration-fields";
import { effectivePriceCzk, buildVariableSymbol, resolveContactEmail, fieldTextValues, confirmedMembershipKey } from "@/lib/document-variables";
import { withMembers, linkChildrenIfConnected } from "@/lib/children";
import { fullNameFrom, compareParticipantsBySurname } from "@/lib/participant-name";

type GuardianInput = {
  name?: string;
  email: string;
  relationship?: string;
  phone?: string;
  receivesCommunications?: boolean;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  // The central "Seznam účastníků" section is reachable by health or mail
  // grants alike -- this is now the shared roster endpoint for both.
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  const [participants, allowedKeys, event, activeFields] = await Promise.all([
    prisma.participant.findMany({
      where: { eventId },
      orderBy: { name: "asc" },
      // All guardians, not just receivesCommunications ones -- resolveContactEmail below
      // needs the fallback-to-first-guardian case too.
      include: { guardians: true },
    }),
    allowedParticipantFieldKeys(user, eventId),
    prisma.event.findUniqueOrThrow({ where: { id: eventId } }).then(withMembers),
    prisma.eventParticipantField.findMany({ where: { eventId, active: true } }),
  ]);
  // Composite ("složené") fields aren't stored -- computed here so they work as columns.
  const composites = activeFields.filter((f) => f.fieldType === "composite" && allowedKeys.has(f.key));
  // Computed columns (price/variable symbol) reuse the same formulas as
  // document merge -- resolved here, not lazily on the client, so the
  // roster's optional "computed" columns (see fixed-participant-fields.ts)
  // show the real value instead of duplicating the formula in a component.
  const scopedParticipants = participants.map((p) => {
    const { guardians, ...rest } = p;
    const forMerge = { ...p, customFieldValues: p.customFieldValues as Record<string, string> | null };
    const values = composites.length > 0 ? fieldTextValues(forMerge, event, activeFields) : {};
    // Membership confirmed by the membership event shows as "Ano" (display only).
    const confirmedKey = confirmedMembershipKey(p, event);
    return {
      ...rest,
      customFieldValues: {
        ...Object.fromEntries(
          Object.entries((p.customFieldValues as Record<string, string> | null) ?? {}).filter(([key]) => allowedKeys.has(key))
        ),
        ...Object.fromEntries(composites.map((f) => [f.key, values[f.key] ?? ""])),
        ...(confirmedKey && allowedKeys.has(confirmedKey) && { [confirmedKey]: "Ano" }),
      },
      guardian: guardians.find((g) => g.receivesCommunications) ?? guardians[0] ?? null,
      computed: {
        price: effectivePriceCzk(forMerge, event),
        // What the last acceptance e-mail carried (null = never sent) -- only
        // flagged with price rules on; without them the roster stays as it was.
        priceSent: event.priceContext ? p.acceptedPriceCzk : null,
        var_symb: buildVariableSymbol(forMerge, event),
        contact_email: resolveContactEmail({ guardians }),
      },
    };
  });

  // Documents-status summary for the list view: one extra query total (not
  // per-participant) -- how many of the event's active document types each
  // participant already has actually RECEIVED back. Excludes `generated`
  // rows (a document we sent them, not one they returned -- see
  // getReceivedItemIds's own comment on the same distinction).
  const documentTypes = await getActiveDocumentTypes(eventId);
  // Part 11-C: distinct TYPES received, not files -- 3 files for the same type (e.g. two
  // more attachments saved on top of an existing one) must never push the count above
  // documentTypes.length. A participantId+eventListItemId Set per participant does that;
  // the old code counted rows (files) instead.
  // Portal uploads in review / rejected don't count (slice 4 #6) -- fetched
  // anyway for the status filter below.
  const receivedTypeIds: Record<string, Set<string>> = {};
  const docRows: Record<string, { eventListItemId: string; receivedVia: string; reviewStatus: ReviewStatus | null }[]> = {};
  if (documentTypes.length > 0 && scopedParticipants.length > 0) {
    const rows: { participantId: string; eventListItemId: string; receivedVia: string; reviewStatus: ReviewStatus | null }[] = await prisma.participantDocument.findMany({
      where: {
        participantId: { in: scopedParticipants.map((p) => p.id) },
        eventListItemId: { in: documentTypes.map((d) => d.id) },
        receivedVia: { not: "generated" },
      },
      select: { participantId: true, eventListItemId: true, receivedVia: true, reviewStatus: true },
    });
    // Types the linked person's permanent document covers count as received (slice 6 #4).
    const typeSet = new Set(documentTypes.map((d) => d.id));
    for (const [participantId, covered] of await profileDocuments(participants)) {
      rows.push(...covered.filter((c) => typeSet.has(c.eventListItemId)).map((c) => ({ participantId, eventListItemId: c.eventListItemId, receivedVia: c.receivedVia, reviewStatus: c.reviewStatus })));
    }
    for (const r of rows) {
      (docRows[r.participantId] ??= []).push(r);
      if (countsAsReceived(r)) (receivedTypeIds[r.participantId] ??= new Set()).add(r.eventListItemId);
    }
  }

  // Status filter (slice 4 #8), the portal's function (src/lib/registration-status.ts):
  // required org fields from the linked person's profile (unlinked: the
  // participant's own values of the fields this event has), pending profile changes.
  const childIds = participants.flatMap((p) => (p.childId ? [p.childId] : []));
  // Slice 5 #5: also the fields this event requires ("Vyžadovat při přihlášce"), per
  // person's audience (unlinked = only fields for both); templates' required flag per audience too.
  const [required, people, changes, rules] = await Promise.all([
    prisma.participantFieldTemplate.findMany({ where: { active: true, requiredInRegistration: true, portalAccess: { not: "hidden" } }, select: { key: true, audience: true } }),
    childIds.length ? prisma.child.findMany({ where: { id: { in: childIds } }, select: { id: true, firstName: true, lastName: true, dateOfBirth: true, fieldValues: true, isAdult: true, leftAt: true, leftVia: true } }) : [],
    childIds.length ? prisma.childChange.findMany({ where: { childId: { in: childIds }, status: "pending" }, select: { childId: true } }) : [],
    templateRules(),
  ]);
  const profiles = new Map(people.map((c) => [c.id, { values: profileValues(c), isAdult: c.isAdult, left: c.leftAt ? { at: c.leftAt, via: c.leftVia } : null }]));
  const changed = new Set(changes.map((c) => c.childId));
  const eventKeys = new Set(activeFields.map((f) => f.key));
  const requiredKeys = (isAdult: boolean | null) => required.filter((f) => appliesTo(f.audience, isAdult)).map((f) => f.key);
  const typeIds = documentTypes.map((d) => d.id);

  const withDocuments = scopedParticipants.map((p, i) => {
    const raw = participants[i];
    const person = raw.childId ? profiles.get(raw.childId) : undefined;
    const profile = person?.values;
    const own = (raw.customFieldValues as Record<string, string> | null) ?? {};
    const asked = askedFields(activeFields, rules, person ? person.isAdult : null);
    return {
      ...p,
      // The linked person is marked "Už nebude chodit" (slice 8 #2) -- a badge; the admin decides.
      personLeft: person?.left ?? null,
      documentsTotal: documentTypes.length,
      documentsReceived: receivedTypeIds[p.id]?.size ?? 0,
      state: registrationState({
        accepted: p.registrationStatus === "accepted",
        docTypeIds: typeIds,
        paymentDocTypeId: typeIds.includes(event.paymentDocTypeId ?? "") ? event.paymentDocTypeId : null,
        docs: docRows[p.id] ?? [],
        requiredEmpty:
          (profile
            ? requiredEmpty(requiredKeys(person.isAdult), profile)
            : requiredEmpty(requiredKeys(null).filter((k) => eventKeys.has(k)), own)) || askedMissing(asked, profile ?? null, own),
        pendingProfileChange: !!raw.childId && changed.has(raw.childId),
      }),
    };
  });
  // Default sort is by surname (Part 2: "Lists: sort by surname by default"), Czech
  // collation -- the DB-level `orderBy: { name: "asc" }` above only decides fetch order
  // before this, real presentation order is decided here where firstName/lastName exist.
  withDocuments.sort(compareParticipantsBySurname);

  return NextResponse.json(withDocuments);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  // The central "Seznam účastníků" section is reachable by health or mail
  // grants alike -- this is now the shared roster endpoint for both.
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  const body = await req.json();
  const { groupName, dateOfBirth, customFieldValues } = body;
  const firstName: string | undefined = typeof body.firstName === "string" ? body.firstName.trim() : undefined;
  const lastName: string | undefined = typeof body.lastName === "string" ? body.lastName.trim() : undefined;
  // firstName/lastName win when given (the central roster's add form); `name` alone stays
  // accepted for other callers (import, scripts) that don't split it.
  const name: string = firstName || lastName ? fullNameFrom(firstName, lastName) : body.name;
  const guardians: GuardianInput[] = Array.isArray(body.guardians) ? body.guardians : [];
  // Part 2: "Přijmout hned" on the add form -- a shortcut past the extra click every
  // manually-typed participant otherwise needs (see docs/registration-workflow.md's
  // "every participant defaults to pending" note). No registration number is assigned
  // here -- that's still deferred to whenever one is actually needed (document
  // generation), same as the existing accept flow (see ensureRegistrationNumber).
  const acceptImmediately = body.acceptImmediately === true;
  // Picked existing child (add form, registration-connected events) -- admin only.
  const childId: string | null = typeof body.childId === "string" && user.role === "admin" ? body.childId : null;
  if (childId && !(await prisma.child.findUnique({ where: { id: childId }, select: { id: true } }))) {
    return NextResponse.json({ error: "child_not_found" }, { status: 400 });
  }

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }
  for (const g of guardians) {
    if (!g.email || typeof g.email !== "string" || !g.email.trim()) {
      return NextResponse.json({ error: "guardian_email_required" }, { status: 400 });
    }
  }

  const participant = await prisma.$transaction(async (tx) => {
    const created = await tx.participant.create({
      data: {
        eventId,
        name: name.trim(),
        firstName: firstName || null,
        lastName: lastName || null,
        groupName: groupName || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        customFieldValues: customFieldValues ?? undefined,
        ...(acceptImmediately && { registrationStatus: "accepted" }),
        ...(childId && { childId }),
      },
    });

    if (guardians.length > 0) {
      await tx.participantGuardian.createMany({
        data: guardians.map((g) => ({
          participantId: created.id,
          name: g.name?.trim() || null,
          email: g.email.trim(),
          relationship: g.relationship?.trim() || null,
          phone: g.phone?.trim() || null,
          receivesCommunications: g.receivesCommunications ?? true,
        })),
      });
    }

    return tx.participant.findUniqueOrThrow({
      where: { id: created.id },
      include: { guardians: true },
    });
  });

  await linkChildrenIfConnected(eventId);
  return NextResponse.json(participant, { status: 201 });
}
