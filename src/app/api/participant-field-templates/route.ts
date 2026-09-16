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
  // "Include in documents" is just MergeVariable.active, read back here so
  // the same admin screen can show/toggle it (see Part 6 -- one setting,
  // not a separate flag to keep in sync).
  const variables = await prisma.mergeVariable.findMany({
    where: { key: { in: templates.map((t) => t.key) } },
    select: { key: true, active: true },
  });
  const activeByKey = new Map(variables.map((v) => [v.key, v.active]));

  return NextResponse.json(
    templates.map((t) => ({ ...t, includeInDocuments: activeByKey.get(t.key) ?? false }))
  );
}

// Creating an org-wide field template also registers a matching
// MergeVariable row (same key, sourceType participant_custom_field) so the
// field is immediately usable in document templates as {{key}} -- the
// auto-link Pavel asked for, instead of a separate manual step on
// /document-variables.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { key, label, fieldType, options, defaultSurfaces, includeInDocuments } = await req.json();
  if (!key || !label || !fieldType) {
    return NextResponse.json({ error: "key, label, and fieldType are required" }, { status: 400 });
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  }

  const template = await prisma.$transaction(async (tx) => {
    const created = await tx.participantFieldTemplate.create({
      data: { key, label, fieldType, options: options ?? undefined, defaultSurfaces: defaultSurfaces ?? [] },
    });
    await tx.mergeVariable.upsert({
      where: { key },
      update: { sourceType: "participant_custom_field", sourceField: key, label, active: includeInDocuments ?? true },
      create: { key, sourceType: "participant_custom_field", sourceField: key, label, active: includeInDocuments ?? true },
    });
    return created;
  });

  return NextResponse.json(template, { status: 201 });
}
