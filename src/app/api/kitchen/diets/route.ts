import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getActingOrgId, isOrgAdmin } from "@/lib/org-scope";
import { hasKitchenAccessInOrg, orgDiets } from "@/lib/kitchen/server";

// The organization's diets (bezlepková, bez laktózy…; Šablony -> Kuchyně) for the pickers and labels:
// Kuchyně users and organization admins (Lidé -> a person's "Strava a alergie").
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const organizationId = await getActingOrgId(user);
  if (!isOrgAdmin(user) && !(await hasKitchenAccessInOrg(user, organizationId))) return NextResponse.json({ error: "module_access_denied" }, { status: 403 });
  return NextResponse.json(await orgDiets(organizationId));
}
