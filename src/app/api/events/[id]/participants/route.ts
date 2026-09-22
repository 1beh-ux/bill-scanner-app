import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess, allowedParticipantFieldKeys } from "@/lib/module-access";
import { getActiveDocumentTypes } from "@/lib/mail-helper-context";
import { effectivePriceCzk, buildVariableSymbol, resolveContactEmail } from "@/lib/document-variables";
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

  const [participants, allowedKeys, event] = await Promise.all([
    prisma.participant.findMany({
      where: { eventId },
      orderBy: { name: "asc" },
      // All guardians, not just receivesCommunications ones -- resolveContactEmail below
      // needs the fallback-to-first-guardian case too.
      include: { guardians: true },
    }),
    allowedParticipantFieldKeys(user, eventId),
    prisma.event.findUniqueOrThrow({ where: { id: eventId } }),
  ]);
  // Computed columns (price/variable symbol) reuse the same formulas as
  // document merge -- resolved here, not lazily on the client, so the
  // roster's optional "computed" columns (see fixed-participant-fields.ts)
  // show the real value instead of duplicating the formula in a component.
  const scopedParticipants = participants.map((p) => {
    const { guardians, ...rest } = p;
    const forMerge = { ...p, customFieldValues: p.customFieldValues as Record<string, string> | null };
    return {
      ...rest,
      customFieldValues: Object.fromEntries(
        Object.entries((p.customFieldValues as Record<string, string> | null) ?? {}).filter(([key]) =>
          allowedKeys.has(key)
        )
      ),
      guardian: guardians.find((g) => g.receivesCommunications) ?? guardians[0] ?? null,
      computed: {
        price: effectivePriceCzk(forMerge, event),
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
  const receivedCounts: Record<string, number> = {};
  if (documentTypes.length > 0 && scopedParticipants.length > 0) {
    const rows = await prisma.participantDocument.findMany({
      where: {
        participantId: { in: scopedParticipants.map((p) => p.id) },
        eventListItemId: { in: documentTypes.map((d) => d.id) },
        receivedVia: { not: "generated" },
      },
      select: { participantId: true },
    });
    for (const r of rows) receivedCounts[r.participantId] = (receivedCounts[r.participantId] ?? 0) + 1;
  }

  const withDocuments = scopedParticipants.map((p) => ({
    ...p,
    documentsTotal: documentTypes.length,
    documentsReceived: receivedCounts[p.id] ?? 0,
  }));
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

  return NextResponse.json(participant, { status: 201 });
}
