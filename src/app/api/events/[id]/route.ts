import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess, requireAnyModuleAccess } from "@/lib/module-access";

// GET is readable by any module grant -- the row carries no module-specific
// secrets (senderEmail/drive folder ids/sync settings are shared config,
// not health data), and Mail Helper's own page needs it for the event name
// and connected mailbox just like every other module's settings screen does.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const denied = await requireAnyModuleAccess(user, id, ["bills", "health", "mail"]);
  if (denied) return denied;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(event);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const denied = await requireModuleAccess(user, id, "bills");
  if (denied) return denied;

  const body = await req.json();
  const { name, startDate, endDate, driveIngestFolderId, driveExportFolderId } = body;
  const event = await prisma.event.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(startDate !== undefined && { startDate: new Date(startDate) }),
      ...(endDate !== undefined && { endDate: new Date(endDate) }),
      ...(driveIngestFolderId !== undefined && { driveIngestFolderId }),
      ...(driveExportFolderId !== undefined && { driveExportFolderId }),
    },
  });
  return NextResponse.json(event);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  // Checked explicitly, not just inferred from a caught constraint error —
  // this is almost always the actual reason deletion is blocked in
  // practice, and it deserves a specific, accurate message with a real
  // count, not a generic "some dependency exists" message.
  const billCount = await prisma.bill.count({ where: { eventId: id } });
  if (billCount > 0) {
    return NextResponse.json({ error: "event_has_bills", billCount }, { status: 409 });
  }

  try {
    await prisma.event.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json({ error: "event_has_dependencies" }, { status: 409 });
    }
    throw err;
  }
}