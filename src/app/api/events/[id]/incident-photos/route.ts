import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { billsBucket, sanitizeFilename } from "@/lib/gcs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const filename = `${hash}-${sanitizeFilename(file.name || "photo.jpg")}`;
  const gcsObjectPath = `events/${eventId}/health/incident-photos/${filename}`;

  await billsBucket.file(gcsObjectPath).save(buffer, {
    contentType: file.type || "image/jpeg",
  });

  return NextResponse.json({ gcsObjectPath, filename }, { status: 201 });
}
