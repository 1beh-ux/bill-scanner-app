import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { eligibilityFacts } from "@/lib/child-profile";
import { isEligible, readEligibility } from "@/lib/portal-rules";
import { requireOrgAdminEvent } from "@/lib/org-scope";

// Event settings -> "Registrace a členství" -> who may register in the portal
// (docs/registration-portal-spec.md H). Admin only.
// GET: what the criteria editor picks from -- groups (existing groupNames),
// other events, children. POST { eligibility }: the children that rule lets in
// (the live count), for a rule not saved yet.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireOrgAdminEvent(id);
  if ("error" in access) return access.error;
  // Groups, other events and people of the event's organization only.
  const { organizationId } = access.event;
  const [groups, events, children] = await Promise.all([
    prisma.participant.findMany({ where: { groupName: { not: null }, event: { organizationId } }, distinct: ["groupName"], select: { groupName: true }, orderBy: { groupName: "asc" } }),
    prisma.event.findMany({ where: { id: { not: id }, organizationId }, select: { id: true, name: true, startDate: true, kind: true, membershipYear: true }, orderBy: { startDate: "desc" } }),
    prisma.child.findMany({ where: { organizationId }, select: { id: true, name: true, dateOfBirth: true }, orderBy: [{ lastName: "asc" }, { name: "asc" }] }),
  ]);
  return NextResponse.json({ groups: groups.map((g) => g.groupName!).filter((g) => g.trim()), events, children });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireOrgAdminEvent(id);
  if ("error" in access) return access.error;
  const body = await req.json();
  const rule = readEligibility(body.eligibility);
  const facts = await eligibilityFacts(access.event.organizationId);
  return NextResponse.json({ eligible: facts.filter((f) => isEligible(rule, f)).map((f) => ({ id: f.childId, name: f.name, dateOfBirth: f.dateOfBirth })) });
}
