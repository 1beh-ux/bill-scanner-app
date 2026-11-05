import { NextResponse } from "next/server";
import { getDriveServiceAccountEmail } from "@/lib/drive";
import { getCurrentUser } from "@/lib/auth";
import { isOrgAdmin } from "@/lib/org-scope";

// The service account (the fallback identity), organization admins only (audit 2026-11-05). Which identity
// an event actually uses is /api/events/[id]/drive-identity.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isOrgAdmin(user)) return NextResponse.json({ error: "admin_only" }, { status: 403 });
  return NextResponse.json({ email: getDriveServiceAccountEmail() });
}
