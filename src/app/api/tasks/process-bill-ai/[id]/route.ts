import { NextRequest, NextResponse } from "next/server";
import { processBillWithAi } from "@/lib/process-bill-ai";
import { secretMatches } from "@/lib/request-security";

// Called only by the Cloud Tasks queue (src/lib/cloud-tasks.ts) — one
// request per bill. There's no signed-in user behind a queued task, so
// this is authenticated with a shared secret header instead of the
// session cookie the rest of the API uses — same pattern already used for
// the exchange-rate cron endpoint (src/app/api/cron/exchange-rates).
function authorized(req: NextRequest): boolean {
  // Constant-time; nothing about the secrets (not even their lengths) is logged.
  const ok = secretMatches(req.headers.get("x-tasks-secret"), process.env.TASKS_SECRET);
  if (!ok) console.log("[process-bill-ai] auth failed", { configured: !!process.env.TASKS_SECRET });
  return ok;
}

// Generous ceiling for a single bill's extraction (GCS download + AI call,
// each with their own shorter internal timeouts) — this is a safety net,
// not the expected duration.
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  // Who started the run (bulk "AI" in the bill list); none = automatic (stuck-bill requeue).
  const result = await processBillWithAi(id, { userId: req.headers.get("x-ai-user") || null });

  if (!result.ok) {
    // Terminal, bill-specific outcomes — retrying won't change any of
    // these. Returning 2xx tells Cloud Tasks the task is done so it stops
    // retrying a bill that will never succeed (e.g. it was deleted, or its
    // event got closed mid-run).
    const terminal = ["not_found", "bill_approved_locked", "event_closed_locked", "no_categories", "no_file"];
    if (terminal.includes(result.error)) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
    }
    // ai_call_failed covers transient trouble — a GCS hiccup, an AI
    // service timeout, a rate limit. A non-2xx here is exactly what tells
    // Cloud Tasks to retry this bill on its own, with its configured
    // backoff, without anyone needing to notice and re-click it.
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true, status: result.status });
}
