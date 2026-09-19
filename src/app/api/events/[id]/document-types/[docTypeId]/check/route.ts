import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { checkEventTemplates } from "@/lib/template-check";
import { loadTemplatePreviewInput } from "@/lib/template-preview";

// One template's variables (same check as the event-wide one, see
// template-check.ts) plus, when a participant is given, the value each
// variable resolves to for them.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docTypeId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId, docTypeId } = await params;
  const denied = await requireModuleAccess(user, eventId, "mail");
  if (denied) return denied;

  const check = await checkEventTemplates(eventId, { docTypeId });
  const template = check.templates[0];
  if (!template) return NextResponse.json({ error: "no_template" }, { status: 404 });

  const participantId = new URL(req.url).searchParams.get("participantId");
  let values: Record<string, string> | null = null;
  let imageKeys: string[] = [];
  if (participantId) {
    const input = await loadTemplatePreviewInput(eventId, docTypeId, participantId);
    if (input) {
      values = input.text;
      imageKeys = Object.keys(input.images);
    }
  }

  return NextResponse.json({ template, unusedFields: check.unusedFields, values, imageKeys });
}
