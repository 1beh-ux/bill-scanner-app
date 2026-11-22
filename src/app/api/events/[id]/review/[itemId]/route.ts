// Fields Manager phase 5: resolve one review item -- { action: "apply" | "dismiss", choice?, values?, always? }.
// Any organization admin may resolve (decision 3); writes go through the import path and are recorded (undoable).
import { NextRequest, NextResponse } from "next/server";
import { fieldsManagerAccess } from "@/app/api/fields/access";
import { prisma } from "@/lib/prisma";
import { resolveItem } from "@/lib/sync-review-run";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id: eventId, itemId } = await params;
  const a = await fieldsManagerAccess();
  if ("error" in a) return a.error;
  if (!(await prisma.event.findFirst({ where: { id: eventId, organizationId: a.organizationId }, select: { id: true } }))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (b.action !== "apply" && b.action !== "dismiss") return NextResponse.json({ error: "invalid" }, { status: 400 });
  const values = b.values && typeof b.values === "object" ? Object.fromEntries(Object.entries(b.values).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1])) : undefined;
  const result = await resolveItem(eventId, a.organizationId, itemId, a.userId, { action: b.action, choice: typeof b.choice === "string" && b.choice ? b.choice : undefined, values, always: b.always === true });
  if ("error" in result) return NextResponse.json(result, { status: result.error === "not_found" ? 404 : result.error === "invalid" ? 400 : 409 });
  return NextResponse.json(result);
}
