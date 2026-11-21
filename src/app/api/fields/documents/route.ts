// GET /api/fields/documents?event=<id> -- which document templates of the event use which keys (phase 2), via the
// existing template check (Google Docs reads, so loaded separately from the overview). Read-only.
import { NextRequest, NextResponse } from "next/server";
import { checkEventTemplates } from "@/lib/template-check";
import { fieldsManagerAccess, pickEvent } from "../access";

export async function GET(req: NextRequest) {
  const access = await fieldsManagerAccess();
  if ("error" in access) return access.error;
  const { selected } = await pickEvent(access.organizationId, req.nextUrl.searchParams.get("event"));
  if (!selected) return NextResponse.json({ templates: [] });
  const result = await checkEventTemplates(selected.id);
  return NextResponse.json({
    templates: result.templates.map((t) => ({
      docTypeId: t.docTypeId,
      name: t.name,
      error: t.error ?? null,
      placeholders: t.placeholders.map((p) => ({ key: p.key, status: p.status, hasSpaces: p.hasSpaces })),
    })),
  });
}
