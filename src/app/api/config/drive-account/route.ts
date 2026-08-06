import { NextResponse } from "next/server";
import { getDriveServiceAccountEmail } from "@/lib/drive";

export async function GET() {
  return NextResponse.json({ email: getDriveServiceAccountEmail() });
}