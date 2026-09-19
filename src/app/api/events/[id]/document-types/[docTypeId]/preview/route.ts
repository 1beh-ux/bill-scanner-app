import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { mergeAndExportDocument } from "@/lib/document-merge";
import { loadTemplatePreviewInput } from "@/lib/template-preview";

// The template merged with one participant's data, as a PDF -- nothing is
// saved, sent or numbered. Slow (a real Drive copy + export, a few seconds).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docTypeId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId, docTypeId } = await params;
  const denied = await requireModuleAccess(user, eventId, "mail");
  if (denied) return denied;

  const participantId = new URL(req.url).searchParams.get("participantId");
  if (!participantId) return NextResponse.json({ error: "participant_required" }, { status: 400 });

  const input = await loadTemplatePreviewInput(eventId, docTypeId, participantId);
  if (!input) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!input.templateGoogleDocId) return NextResponse.json({ error: "no_template" }, { status: 404 });

  try {
    const pdf = await mergeAndExportDocument(input.templateGoogleDocId, input.text, input.images, undefined, input.imageSizesMm);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="preview.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[template-preview] merge failed:", err);
    return NextResponse.json({ error: "merge_failed" }, { status: 502 });
  }
}
