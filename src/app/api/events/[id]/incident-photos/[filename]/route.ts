import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { billsBucket } from "@/lib/gcs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId, filename } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;

  const file = billsBucket.file(`events/${eventId}/health/incident-photos/${filename}`);
  const [exists] = await file.exists();
  if (!exists) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [metadata] = await file.getMetadata();
  const [buffer] = await file.download();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": metadata.contentType || "image/jpeg",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
