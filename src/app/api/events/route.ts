import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const events = await prisma.event.findMany({
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

    return created;
  });

  return NextResponse.json(event, { status: 201 });
}
