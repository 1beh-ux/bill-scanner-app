import { NextResponse } from "next/server";
import { getDriveServiceAccountEmail } from "@/lib/drive";
import { prisma } from "@/lib/prisma";

// `email` stays the service account (what folders must be shared with for
// import); `connectedEmail` is the OAuth account that does the uploads, if any.
export async function GET() {
  const connected = await prisma.driveAccount.findFirst({
    orderBy: { connectedAt: "desc" },
    select: { email: true },
  });
  return NextResponse.json({ email: getDriveServiceAccountEmail(), connectedEmail: connected?.email ?? null });
}
