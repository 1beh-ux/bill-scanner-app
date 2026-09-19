import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { checkEventTemplates, applyTemplateKeys } from "@/lib/template-check";

// Reads every document type's Google Doc template and compares its {{...}}
// placeholders with the event's participant fields (see template-check.ts).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  return NextResponse.json(await checkEventTemplates(eventId));
}

// Adds the chosen unmapped placeholders as document-enabled fields.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  const { keys } = (await req.json()) as { keys: string[] };
  if (!Array.isArray(keys)) return NextResponse.json({ error: "keys_required" }, { status: 400 });
  return NextResponse.json(await applyTemplateKeys(eventId, keys));
}
