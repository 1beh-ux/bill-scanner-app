import { NextRequest, NextResponse } from "next/server";
import { authorizePlanning, loadPlanPayload } from "@/lib/planning-server";
import { scheduleDays } from "@/lib/planning-export";
import { scheduleHtml } from "@/lib/planning-pdf";
import { renderPdf } from "@/lib/pdf-service";

// Schedule PDF (A4 landscape, parallel blocks side by side). Same filters as
// the CSV: ?day=<dayId>, ?leader=<leaderId>, ?group=<name>.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;

  const search = new URL(req.url).searchParams;
  const day = search.get("day");
  const leader = search.get("leader");
  const group = search.get("group");
  const payload = await loadPlanPayload(eventId);
  const leaderName = payload.leaders.find((l) => l.id === leader)?.name;

  const html = scheduleHtml({
    eventName: payload.event.name,
    days: scheduleDays(payload, { dayIds: day ? new Set([day]) : undefined, leaderId: leader ?? undefined, group: group ?? undefined }),
    subtitle: [leaderName, group].filter(Boolean).map((n) => `Program pro: ${n}`).join(" · ") || undefined,
    showLeader: !leader,
  });

  let pdf: Buffer;
  try {
    pdf = await renderPdf(html, "A4", true);
  } catch (err) {
    console.error("[planning pdf] render failed", err);
    return NextResponse.json({ error: "pdf_render_failed" }, { status: 502 });
  }

  const slug = [payload.event.name, leaderName, group].filter(Boolean).join("-").normalize("NFD").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").toLowerCase();
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="program-${slug}.pdf"` },
  });
}
