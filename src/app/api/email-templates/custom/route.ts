import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { templateScope } from "@/lib/template-scope";
import { CUSTOM_PURPOSE_PREFIX, isCustomPurpose } from "@/lib/email-template-purpose-keys";
import { cleanName, customStarter, newCustomPurposeKey } from "@/lib/custom-email-templates";

// Šablony e-mailů -> Vlastní e-maily: the organization's own templates (or the app's with ?level=app).
// Their text is edited through /api/email-templates like any other purpose.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const scope = await templateScope(req, user, false);
  if ("error" in scope) return scope.error;
  const rows = await prisma.emailTemplate.findMany({
    where: { organizationId: scope.organizationId, purposeKey: { startsWith: CUSTOM_PURPOSE_PREFIX } },
    select: { purposeKey: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const scope = await templateScope(req, user, true);
  if ("error" in scope) return scope.error;
  const name = cleanName((await req.json().catch(() => ({}))).name);
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
  const row = await prisma.emailTemplate.create({ data: { organizationId: scope.organizationId, purposeKey: newCustomPurposeKey(), name, ...customStarter(name) }, select: { purposeKey: true, name: true } });
  return NextResponse.json(row, { status: 201 });
}

/** Deletes the template and the events' changed copies of it. */
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const scope = await templateScope(req, user, true);
  if ("error" in scope) return scope.error;
  const purposeKey = req.nextUrl.searchParams.get("purposeKey") ?? "";
  if (!isCustomPurpose(purposeKey)) return NextResponse.json({ error: "not_custom" }, { status: 400 });
  await prisma.$transaction([
    ...(scope.organizationId ? [prisma.eventEmailTemplate.deleteMany({ where: { purposeKey, name: null, event: { organizationId: scope.organizationId } } })] : []),
    prisma.emailTemplate.deleteMany({ where: { organizationId: scope.organizationId, purposeKey } }),
  ]);
  return NextResponse.json({ ok: true });
}
