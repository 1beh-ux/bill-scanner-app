// Templates on three levels (organizations step 4): app (organization_id NULL) ->
// organization -> event. The template routes serve the first two: `?level=app` = the
// app rows (Aplikace -> Šablony aplikace, super-admin only, reads included), otherwise
// the acting organization's rows (writes: its admins). App rows never show up in an
// organization's lists or event copies -- they only reach an organization by copy.
import { NextResponse } from "next/server";
import type { User } from "@/generated/prisma";
import { getActingOrgId, isOrgAdmin, requireSuperAdmin } from "@/lib/org-scope";

export type TemplateScope = { organizationId: string | null; app: boolean };

export async function templateScope(req: Request, user: User, write: boolean): Promise<{ error: NextResponse } | TemplateScope> {
  if (new URL(req.url).searchParams.get("level") === "app") {
    const notSuperAdmin = requireSuperAdmin(user);
    return notSuperAdmin ? { error: notSuperAdmin } : { organizationId: null, app: true };
  }
  if (write && !isOrgAdmin(user)) return { error: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  return { organizationId: await getActingOrgId(user), app: false };
}
