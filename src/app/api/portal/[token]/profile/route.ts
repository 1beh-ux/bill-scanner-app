import { NextRequest, NextResponse } from "next/server";
import { portalAccessMap, portalScope, scopeMember } from "@/lib/portal-server";
import { guardiansJson, proposeChange, readGuardians, updateProfile } from "@/lib/child-profile";
import { GUARDIANS_CHANGE_KEY, isIsoDate, profileValues } from "@/lib/portal-rules";

// A parent's profile edit: { memberId?, values?: Record<key, string>, guardians?: [...] }
// (memberId: which person of a family link; a child link needs none).
// Per field rule: `edit` applies (and pushes) at once, `approval` becomes a
// pending change, `read`/`hidden` are ignored. Guardians always need approval
// (they decide who gets e-mails) -- one pending change for the whole list.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { scope, error } = await portalScope(token, true);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const child = scopeMember(scope, body.memberId);
  if (!child) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (body.values !== undefined) {
    if (!body.values || typeof body.values !== "object") return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const access = await portalAccessMap(scope.organizationId);
    const current = profileValues(child);
    const direct: Record<string, string> = {};
    for (const [key, raw] of Object.entries(body.values as Record<string, unknown>)) {
      if (typeof raw !== "string") continue;
      const value = raw.trim().slice(0, 2000);
      if (key === "datum_narozeni" && value && !isIsoDate(value)) return NextResponse.json({ error: "bad_date" }, { status: 400 });
      const level = access.get(key);
      if (level === "edit") direct[key] = value;
      else if (level === "approval") await proposeChange(child.id, key, current[key] ?? "", value);
    }
    if (Object.keys(direct).length) await updateProfile(child.id, direct);
  }

  if (body.guardians !== undefined) {
    const guardians = readGuardians(body.guardians);
    if (!guardians || guardians.length === 0) return NextResponse.json({ error: "bad_guardians" }, { status: 400 });
    await proposeChange(child.id, GUARDIANS_CHANGE_KEY, guardiansJson(child.guardians), guardiansJson(guardians));
  }

  return NextResponse.json({ ok: true });
}
