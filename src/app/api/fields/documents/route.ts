// GET /api/fields/documents?event=<id> -- which document templates of the event use which keys (phase 2), via the
// existing template check (Google Docs reads, so loaded separately from the overview). Read-only.
import { NextRequest, NextResponse } from "next/server";
import { checkEventTemplates } from "@/lib/template-check";
import { prisma } from "@/lib/prisma";
import { fieldsManagerAccess, pickEvent } from "../access";

export async function GET(req: NextRequest) {
  const access = await fieldsManagerAccess();
  if ("error" in access) return access.error;
  const { selected } = await pickEvent(access.organizationId, req.nextUrl.searchParams.get("event"));
  if (!selected) return NextResponse.json({ templates: [] });
  const [result, items] = await Promise.all([checkEventTemplates(selected.id), prisma.eventListItem.findMany({ where: { eventId: selected.id, kind: "document" }, select: { id: true, data: true } })]);
  const disabled = new Map(items.map((i) => [i.id, ((i.data as { disabledFields?: string[] } | null)?.disabledFields ?? []).filter((k) => typeof k === "string")]));
  return NextResponse.json({
    templates: result.templates.map((t) => ({
      docTypeId: t.docTypeId,
      name: t.name,
      error: t.error ?? null,
      disabled: disabled.get(t.docTypeId) ?? [],
      placeholders: t.placeholders.map((p) => ({ key: p.key, status: p.status, hasSpaces: p.hasSpaces })),
    })),
  });
}
