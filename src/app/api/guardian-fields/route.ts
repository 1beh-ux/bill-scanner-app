// GET -> the organization's own guardian fields (src/lib/guardian-fields.ts) for the screens that edit guardians
// (Lidé, the participant detail, import). Any signed-in user of the organization; changes go through Pole → Formulář.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId } from "@/lib/org-scope";
import { guardianSettings } from "@/lib/guardian-fields-server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const s = await guardianSettings(await getActingOrgId(user));
  return NextResponse.json({ fields: s.fields, fixedRequired: s.fixedRequired });
}
