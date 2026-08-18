import { NextRequest, NextResponse } from "next/server";
import type { ModuleKey } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const MANAGEABLE_MODULES: ModuleKey[] = ["bills", "health"];

// Grant management is admin-only, same as /api/users (whose list this grid
// is built from) and every other org-wide admin surface in the app.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }
  const { id: eventId } = await params;

  const [users, grants] = await Promise.all([
    prisma.user.findMany({ where: { active: true }, orderBy: { displayName: "asc" } }),
    prisma.userEventModuleAccess.findMany({ where: { eventId } }),
  ]);

  const grantSet = new Set(grants.map((g) => `${g.userId}:${g.moduleKey}`));

  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      role: u.role,
      access: Object.fromEntries(
        MANAGEABLE_MODULES.map((key) => [key, grantSet.has(`${u.id}:${key}`)])
      ),
    }))
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }
  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({}));
  const userId: string | undefined = body.userId;
  const moduleKey: ModuleKey | undefined = body.moduleKey;

  if (!userId || !moduleKey || !MANAGEABLE_MODULES.includes(moduleKey)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  await prisma.userEventModuleAccess.upsert({
    where: { userId_eventId_moduleKey: { userId, eventId, moduleKey } },
    create: { userId, eventId, moduleKey },
    update: {},
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }
  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({}));
  const userId: string | undefined = body.userId;
  const moduleKey: ModuleKey | undefined = body.moduleKey;

  if (!userId || !moduleKey || !MANAGEABLE_MODULES.includes(moduleKey)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  await prisma.userEventModuleAccess.deleteMany({
    where: { userId, eventId, moduleKey },
  });

  return NextResponse.json({ ok: true });
}
