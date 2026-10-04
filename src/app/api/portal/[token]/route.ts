import { NextRequest, NextResponse } from "next/server";
import { portalScope, portalData } from "@/lib/portal-server";

// Parent portal data (public route, see src/proxy.ts): token + this device's
// birth-date cookie, then profile / available events / registrations / history.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { scope, error } = await portalScope(token, true);
  if (error) return error;
  return NextResponse.json(await portalData(scope), { headers: { "Cache-Control": "no-store" } });
}
