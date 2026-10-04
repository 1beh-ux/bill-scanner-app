import { NextRequest, NextResponse } from "next/server";
import { portalChild, portalData } from "@/lib/portal-server";

// Parent portal data (public route, see src/proxy.ts): token + this device's
// birth-date cookie, then profile / available events / registrations / history.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { child, error } = await portalChild(token, true);
  if (error) return error;
  return NextResponse.json(await portalData(child), { headers: { "Cache-Control": "no-store" } });
}
