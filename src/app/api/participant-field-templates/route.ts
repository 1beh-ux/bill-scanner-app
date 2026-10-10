import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { templateScope } from "@/lib/template-scope";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const scope = await templateScope(req, user, false);
  if ("error" in scope) return scope.error;

  // The acting organization's templates.
  const templates = await prisma.participantFieldTemplate.findMany({
    where: { organizationId: scope.organizationId },
    orderBy: { key: "asc" },
  });
  // "Include in documents" is just the `documents` surface -- no separate
  // flag to keep in sync now that MergeVariable is gone.
  return NextResponse.json(
    templates.map((t) => ({ ...t, includeInDocuments: t.defaultSurfaces.includes("documents") }))
  );
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // Writes: the organization's admin (?level=app: an app template, super-admin).
  const scope = await templateScope(req, user, true);
  if ("error" in scope) return scope.error;

  const { key, label, fieldType, options, defaultSurfaces } = await req.json();
  if (!key || !label || !fieldType) {
    return NextResponse.json({ error: "key, label, and fieldType are required" }, { status: 400 });
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  }

  const template = await prisma.participantFieldTemplate.create({
    data: { key, label, fieldType, options: options ?? undefined, defaultSurfaces: defaultSurfaces ?? [], organizationId: scope.organizationId },
  });

  return NextResponse.json(template, { status: 201 });
}
