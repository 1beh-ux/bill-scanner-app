import { NextRequest, NextResponse } from "next/server";
import { ADD_MEMBER_PER_DAY, addFamilyMember, portalScope } from "@/lib/portal-server";
import { takeRateSlot } from "@/lib/portal-rate";

// Portal "Přidat člena rodiny" (docs/registration-slice8-spec.md #1): a family
// link adds a person to its family -- { person: { firstName, lastName,
// birthDate, isAdult, values, email?, phone? }, guardians } (src/lib/portal-server.ts
// addFamilyMember). Invalid = 400 { fields }. A person's own link can't.
// Max ADD_MEMBER_PER_DAY per family.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { scope, error } = await portalScope(token, true);
  if (error) return error;
  if (scope.kind !== "family") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (!(await takeRateSlot(`member:${scope.id}`, ADD_MEMBER_PER_DAY, 24 * 3600 * 1000))) return NextResponse.json({ error: "throttled" }, { status: 429 });
  const added = await addFamilyMember(scope, body);
  if ("error" in added) return NextResponse.json(added, { status: 400 });
  return NextResponse.json({ ok: true, id: added.id }, { status: 201 });
}
