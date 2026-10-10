import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { templateScope } from "@/lib/template-scope";

// Bill category templates: the acting organization's, or with ?level=app the app's (super-admin).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const scope = await templateScope(req, user, false);
  if ("error" in scope) return scope.error;

  const templates = await prisma.categoryTemplate.findMany({
    where: { organizationId: scope.organizationId },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // Writes: the organization's admin (app level: super-admin).
  const scope = await templateScope(req, user, true);
  if ("error" in scope) return scope.error;

  const { name } = await req.json();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const template = await prisma.categoryTemplate.create({ data: { name, organizationId: scope.organizationId } });
  return NextResponse.json(template, { status: 201 });
}
