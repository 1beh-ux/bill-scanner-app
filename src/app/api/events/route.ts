import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { orgIdOfUser } from "@/lib/org-owner";
import { isOrgAdmin, orgWhere } from "@/lib/org-scope";
import { createEventWithDefaults } from "@/lib/event-create";

// ?module=bills -> only events where the user may work with bills (what a
// "move to another event" picker needs); without it, every event the user holds
// any module grant on (the switcher). Admin: everything either way.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Admin sees every event; everyone else only events they hold at least one
  // module grant on (the event switcher and pickers are built from this).
  const requested = new URL(req.url).searchParams.get("module");
  const moduleFilter = requested === "bills" || requested === "participants" || requested === "health" || requested === "mail" || requested === "planning" || requested === "bank" ? requested : undefined;
  // Always within the acting organization (switcher, "move bill to event" targets, pickers).
  const scope = await orgWhere(user);
  const events = await prisma.event.findMany({
    where:
      // Banka is granted to admins too (src/lib/module-access.ts): no admin shortcut for it.
      isOrgAdmin(user) && moduleFilter !== "bank"
        ? scope
        : { ...scope, moduleAccess: { some: { userId: user.id, ...(moduleFilter && { moduleKey: moduleFilter }) } } },
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!isOrgAdmin(user)) {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }

  const body = await req.json();
  const { name, startDate, endDate } = body;
  // Veřejná akce (docs/public-event-tickets-spec.md): ticket sales -- no participants, documents or
  // participant fields; Účtenky + Vstupenky on.
  const isPublic = body.kind === "public_event";

  if (!name || !startDate || !endDate) {
    return NextResponse.json(
      { error: "name, startDate, and endDate are required" },
      { status: 400 }
    );
  }

  const event = await createEventWithDefaults({ name, startDate, endDate, organizationId: await orgIdOfUser(user), isPublic });

  return NextResponse.json(event, { status: 201 });
}
