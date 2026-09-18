import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const templates = await prisma.participantFieldTemplate.findMany({
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
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { key, label, fieldType, options, defaultSurfaces } = await req.json();
  if (!key || !label || !fieldType) {
    return NextResponse.json({ error: "key, label, and fieldType are required" }, { status: 400 });
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  }

  const template = await prisma.participantFieldTemplate.create({
    data: { key, label, fieldType, options: options ?? undefined, defaultSurfaces: defaultSurfaces ?? [] },
  });

  return NextResponse.json(template, { status: 201 });
}
