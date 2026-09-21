import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { seedFixedParticipantFields } from "@/lib/participant-field-seed";

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
  const moduleFilter = requested === "bills" || requested === "health" || requested === "mail" ? requested : undefined;
  const events = await prisma.event.findMany({
    where:
      user.role === "admin"
        ? {}
        : { moduleAccess: { some: { userId: user.id, ...(moduleFilter && { moduleKey: moduleFilter }) } } },
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (user.role !== "admin") {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }

  const body = await req.json();
  const { name, startDate, endDate } = body;

  if (!name || !startDate || !endDate) {
    return NextResponse.json(
      { error: "name, startDate, and endDate are required" },
      { status: 400 }
    );
  }

  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
    });

    const templates = await tx.categoryTemplate.findMany();

    if (templates.length > 0) {
      await tx.eventCategory.createMany({
        data: templates.map((t) => ({
          eventId: created.id,
          name: t.name,
          description: t.description,
          budgetAmount: 0,
          isFromTemplate: true,
        })),
      });
    }

    const listTemplates = await tx.listTemplate.findMany({ where: { active: true } });
    if (listTemplates.length > 0) {
      await tx.eventListItem.createMany({
        data: listTemplates.map((lt) => ({
          eventId: created.id,
          kind: lt.kind,
          key: lt.key,
          name: lt.name,
          sortOrder: lt.sortOrder,
          data: lt.data ?? undefined,
          isFromTemplate: true,
        })),
      });
    }

    await tx.eventModule.createMany({
      data: [
        { eventId: created.id, moduleKey: "bills", enabled: true },
        { eventId: created.id, moduleKey: "health", enabled: false },
      ],
    });

    const fieldTemplates = await tx.participantFieldTemplate.findMany({ where: { active: true } });
    if (fieldTemplates.length > 0) {
      await tx.eventParticipantField.createMany({
        data: fieldTemplates.map((f) => ({
          eventId: created.id,
          key: f.key,
          label: f.label,
          fieldType: f.fieldType,
          options: f.options ?? undefined,
          // Was hardcoded to ["list"], ignoring the template's own
          // defaultSurfaces -- inconsistent with syncParticipantFieldsForEvent,
          // which already gets this right.
          surfaces: f.defaultSurfaces,
          isFromTemplate: true,
        })),
      });
    }

    return created;
  });

  await seedFixedParticipantFields(event.id);

  return NextResponse.json(event, { status: 201 });
}
