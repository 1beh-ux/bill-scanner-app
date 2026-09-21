import { NextResponse } from "next/server";
import { getDriveServiceAccountEmail } from "@/lib/drive";

// The service account (the fallback identity). Which identity an event actually
// uses is /api/events/[id]/drive-identity.
export async function GET() {
  return NextResponse.json({ email: getDriveServiceAccountEmail() });
}
