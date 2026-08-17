import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { processBillWithAi } from "@/lib/process-bill-ai";

// Interactive single-bill "reprocess" button — this one stays synchronous
// (called and awaited directly, no queue) since it's a single file
// triggered by someone watching the screen for a result. The extraction +
// persistence logic itself now lives in src/lib/process-bill-ai.ts, shared
// with the Cloud Tasks worker used for bulk runs.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const result = await processBillWithAi(id);

  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "no_categories"
          ? 400
          : result.error === "ai_call_failed"
            ? 502
            : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, status: result.status, bill: result.bill });
}
