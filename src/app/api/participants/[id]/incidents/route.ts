import { NextRequest, NextResponse } from "next/server";
import type { BodyView, IncidentCategory, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { resolveIncidentState, type EffectiveIncident } from "@/lib/incident-state";

type EffectiveIncidentWithFollowUps = EffectiveIncident & { followUps: EffectiveIncident[] };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: participantId } = await params;
  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireModuleAccess(user, participant.eventId, "health");
  if (denied) return denied;

  const topLevel = await prisma.incident.findMany({
    where: { participantId, parentIncidentId: null },
    orderBy: { createdAt: "desc" },
    include: {
      updates: { orderBy: { updatedAt: "asc" } },
      followUps: {
        orderBy: { createdAt: "asc" },
        include: { updates: { orderBy: { updatedAt: "asc" } } },
      },
    },
  });

  const result: EffectiveIncidentWithFollowUps[] = [];
  for (const incident of topLevel) {
    const effective = resolveIncidentState(incident, incident.updates);
    if (!effective) continue;

    const followUps: EffectiveIncident[] = [];
    for (const followUp of incident.followUps) {
      const effectiveFollowUp = resolveIncidentState(followUp, followUp.updates);
      if (effectiveFollowUp) followUps.push(effectiveFollowUp);
    }

    result.push({ ...effective, followUps });
  }

  return NextResponse.json(result);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: participantId } = await params;
  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireModuleAccess(user, participant.eventId, "health");
  if (denied) return denied;

  const body = await req.json();
  const {
    parentIncidentId,
    actionSummary,
    pillName,
    details,
    photoGcsPath,
    tempC,
    templateType,
    incidentTime,
  } = body;
  type DecimalInput = number | string | Prisma.Decimal | null | undefined;
  let category: IncidentCategory | undefined = body.category;
  let bodyView: BodyView | null | undefined = body.bodyView;
  let bodyXPct: DecimalInput = body.bodyXPct;
  let bodyYPct: DecimalInput = body.bodyYPct;
  let effectiveTemplateType: string | null | undefined = templateType;
  const incidentDate: string = body.incidentDate || new Date().toISOString().slice(0, 10);

  if (!actionSummary || typeof actionSummary !== "string" || !actionSummary.trim()) {
    return NextResponse.json({ error: "action_summary_required" }, { status: 400 });
  }

  let parent = null;
  if (parentIncidentId) {
    parent = await prisma.incident.findUnique({
      where: { id: parentIncidentId },
      include: { updates: { orderBy: { updatedAt: "asc" } } },
    });
    if (!parent || parent.participantId !== participantId) {
      return NextResponse.json({ error: "invalid_parent" }, { status: 400 });
    }
    const parentEffective = resolveIncidentState(parent, parent.updates);
    if (!parentEffective) {
      return NextResponse.json({ error: "invalid_parent" }, { status: 400 });
    }
    // Follow-ups inherit category/template/body-map location from the
    // parent's current state -- the client's own values for these fields
    // are ignored, matching "follow-up mode locks category, template, and
    // body-map location."
    category = parentEffective.category;
    effectiveTemplateType = parentEffective.templateType;
    bodyView = parentEffective.bodyView;
    bodyXPct = parentEffective.bodyXPct;
    bodyYPct = parentEffective.bodyYPct;
  } else if (!category) {
    return NextResponse.json({ error: "category_required" }, { status: 400 });
  }

  const incident = await prisma.incident.create({
    data: {
      participantId,
      createdByUserId: user.id,
      category: category!,
      templateType: effectiveTemplateType || null,
      incidentDate: new Date(incidentDate),
      incidentTime: incidentTime || null,
      actionSummary: actionSummary.trim(),
      pillName: pillName || null,
      details: typeof details === "string" && details.trim() ? details.trim() : null,
      photoGcsPath: photoGcsPath || null,
      parentIncidentId: parent ? parent.id : null,
      tempC: tempC === "" || tempC === undefined ? null : tempC,
      bodyView: bodyView || null,
      bodyXPct: bodyXPct === "" || bodyXPct === undefined ? null : bodyXPct,
      bodyYPct: bodyYPct === "" || bodyYPct === undefined ? null : bodyYPct,
    },
  });

  return NextResponse.json(incident, { status: 201 });
}
