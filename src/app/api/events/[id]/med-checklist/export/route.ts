import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { fetchMedChecklistDay, fetchMedChecklistGrid } from "@/lib/med-checklist-grid";
import { buildPlanReportHtml, buildGridReportHtml } from "@/lib/med-report-templates";
import { renderPdf, type PdfFormat } from "@/lib/pdf-service";

export async function GET(
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

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") === "grid" ? "grid" : "plan";
  const mode = searchParams.get("mode") === "hybrid" ? "hybrid" : "blank";
  const format: PdfFormat = searchParams.get("format") === "A3" ? "A3" : "A4";

  let html: string;
  let filename: string;
  let landscape = false;

  if (type === "plan") {
    const dateParam = searchParams.get("date");
    const slotId = searchParams.get("slotId");
    if (!dateParam || !slotId) {
      return NextResponse.json({ error: "date_and_slot_required" }, { status: 400 });
    }
    const slot = await prisma.eventListItem.findUnique({ where: { id: slotId } });
    if (!slot || slot.eventId !== eventId) {
      return NextResponse.json({ error: "invalid_slot" }, { status: 400 });
    }
    const rows = await fetchMedChecklistDay(eventId, new Date(dateParam), slotId);
    html = buildPlanReportHtml({
      eventName: event.name,
      dateLabel: new Date(dateParam).toLocaleDateString("cs-CZ"),
      slotName: slot.name,
      rows,
      mode,
    });
    filename = `leky-plan-${dateParam}.pdf`;
  } else {
    const startParam = searchParams.get("startDate");
    const endParam = searchParams.get("endDate");
    if (!startParam || !endParam) {
      return NextResponse.json({ error: "date_range_required" }, { status: 400 });
    }
    const start = new Date(startParam);
    const end = new Date(endParam);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      return NextResponse.json({ error: "invalid_date_range" }, { status: 400 });
    }
    const grid = await fetchMedChecklistGrid(eventId, start, end);
    html = buildGridReportHtml({
      eventName: event.name,
      rangeLabel: `${start.toLocaleDateString("cs-CZ")} – ${end.toLocaleDateString("cs-CZ")}`,
      grid,
      mode,
    });
    filename = `leky-prehled-${startParam}-${endParam}.pdf`;
    landscape = true;
  }

  let pdf: Buffer;
  try {
    pdf = await renderPdf(html, format, landscape);
  } catch (err) {
    console.error("[med-checklist export] render failed", err);
    return NextResponse.json({ error: "pdf_render_failed" }, { status: 502 });
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
