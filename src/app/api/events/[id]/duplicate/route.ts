import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isOrgAdmin, requireEventInOrg } from "@/lib/org-scope";
import { duplicateEvent } from "@/lib/event-duplicate";
import { isDuplicatePart } from "@/lib/event-duplicate-parts";

// "Duplikovat akci": a new event from this one with the parts the wizard ticked (src/lib/event-duplicate.ts).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isOrgAdmin(user)) return NextResponse.json({ error: "admin_only" }, { status: 403 });
  const { id } = await params;
  const inOrg = await requireEventInOrg(user, id);
  if ("error" in inOrg) return inOrg.error;
  const b = (await req.json().catch(() => ({}))) as { name?: unknown; startDate?: unknown; endDate?: unknown; parts?: unknown };
  const date = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 200) : "";
  if (!name || !date(b.startDate) || !date(b.endDate) || (b.endDate as string) < (b.startDate as string)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const parts = Array.isArray(b.parts) ? b.parts.filter(isDuplicatePart) : [];
  return NextResponse.json(await duplicateEvent(id, { name, startDate: b.startDate as string, endDate: b.endDate as string, parts }), { status: 201 });
}
