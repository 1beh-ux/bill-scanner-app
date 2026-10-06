import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { portalScope, scopeMember } from "@/lib/portal-server";
import { leftData } from "@/lib/portal-rules";

// Portal "Už nebude chodit" (docs/registration-slice8-spec.md #2):
// { memberId?, leave: true, note? } marks the person inactive (leftVia = portal),
// { memberId?, leave: false } is "Obnovit" (clears it). Nothing is deleted or
// sent; registrations stay (the roster shows a badge, the admin decides).
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { scope, error } = await portalScope(token, true);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const child = scopeMember(scope, body.memberId);
  if (!child || typeof body.leave !== "boolean") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  await prisma.child.update({ where: { id: child.id }, data: leftData(body.leave, "portal", body.note) });
  return NextResponse.json({ ok: true });
}
