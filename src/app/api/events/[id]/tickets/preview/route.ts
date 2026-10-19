import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { resolveEmailTemplate } from "@/lib/email-template";
import { TICKET_DOCUMENT_PURPOSE_KEY } from "@/lib/email-template-purpose-keys";
import { renderTicketsPdf } from "@/lib/tickets-pdf";
import { formatTicketCode, newTicketCode } from "@/lib/tickets-server";

// Ticket template preview: a sample ticket of this event as the real PDF (body = the template being
// edited, else the saved one). The sample QR holds a random code that matches no ticket.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const denied = await requireModuleAccess(user, id, "tickets");
  if (denied) return denied;
  const e = await prisma.event.findUniqueOrThrow({ where: { id }, include: { organization: { select: { name: true } } } });
  const { body } = (await req.json().catch(() => ({}))) as { body?: unknown };
  const template = typeof body === "string" && body.trim() ? body : (await resolveEmailTemplate(id, TICKET_DOCUMENT_PURPOSE_KEY)).body;
  const code = newTicketCode();
  const d = (x: Date) => x.toLocaleDateString("cs-CZ", { timeZone: "UTC" });
  const pdf = await renderTicketsPdf(template, [
    {
      code,
      vars: {
        event_name: e.name,
        event_date: d(e.startDate) === d(e.endDate) ? d(e.startDate) : `${d(e.startDate)} – ${d(e.endDate)}`,
        event_place: e.location ?? "",
        buyer_name: "Jana Nováková",
        order_number: "1",
        order_items: "2× Vstupné",
        order_total: "600 Kč",
        ticket_count: "2",
        ticket_no: "1",
        ticket_code: formatTicketCode(code),
        price_type: "Vstupné",
        organization_name: e.organization.name,
        sender_email: e.senderEmail ?? "",
        signature: e.organization.name,
      },
    },
  ]);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
}
