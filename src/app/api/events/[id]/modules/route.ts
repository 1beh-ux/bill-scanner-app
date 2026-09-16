import { NextRequest, NextResponse } from "next/server";
import type { ModuleKey } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { syncParticipantFieldsForEvent } from "@/lib/participant-field-sync";

const MANAGEABLE_MODULES: ModuleKey[] = ["bills", "health", "mail"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;

  const rows = await prisma.eventModule.findMany({ where: { eventId } });
  const enabledByKey = new Map(rows.map((r) => [r.moduleKey, r.enabled]));

  return NextResponse.json(
    MANAGEABLE_MODULES.map((key) => ({
      moduleKey: key,
      enabled: enabledByKey.get(key) ?? false,
    }))
  );
}

export async function PATCH(
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
  const moduleKey: ModuleKey | undefined = body.moduleKey;
  const enabled: unknown = body.enabled;

  if (!moduleKey || !MANAGEABLE_MODULES.includes(moduleKey) || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const before = await prisma.eventModule.findUnique({ where: { eventId_moduleKey: { eventId, moduleKey } } });
  const wasEnabled = before?.enabled ?? false;

  const updated = await prisma.eventModule.upsert({
    where: { eventId_moduleKey: { eventId, moduleKey } },
    create: { eventId, moduleKey, enabled },
    update: { enabled },
  });

  // Newly enabled: pull in any org-template participant fields meant for
  // this module (see src/lib/participant-field-sync.ts) so they show up
  // with sensible defaults immediately instead of the Účastníci tab
  // looking empty for a module that was just turned on.
  if (enabled && !wasEnabled) {
    await syncParticipantFieldsForEvent(eventId, moduleKey);
  }

  return NextResponse.json(updated);
}
