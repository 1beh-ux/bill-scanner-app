import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { itemsLine, scanTime, type OrderItem } from "@/lib/tickets";

const STATUS = { pending: "čeká na platbu", paid: "zaplaceno", cancelled: "zrušeno" } as const;
const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Orders as CSV (semicolons + BOM: opens straight in Czech Excel), one row per order.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "tickets");
  if (denied) return denied;
  const orders = await prisma.ticketOrder.findMany({ where: { eventId }, orderBy: { number: "asc" }, include: { tickets: { select: { seq: true, usedAt: true }, orderBy: { seq: "asc" } } } });
  const rows = [
    ["Číslo", "Vytvořeno", "Jméno", "E-mail", "Telefon", "Vstupenky", "Počet", "Celkem Kč", "VS", "Stav", "Zaplaceno", "Odesláno", "U vchodu", "Čas vstupu", "Poznámka"],
    ...orders.map((o) => [
      o.number,
      o.createdAt.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" }),
      o.buyerName,
      o.email,
      o.phone,
      itemsLine(o.items as OrderItem[]),
      o.tickets.length,
      o.totalCzk,
      o.variableSymbol,
      STATUS[o.status],
      o.paidAt?.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" }),
      o.ticketsSentAt?.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" }),
      o.tickets.filter((t) => t.usedAt).length,
      o.tickets.filter((t) => t.usedAt).map((t) => `${t.seq}: ${scanTime(t.usedAt!)}`).join(", "),
      o.note,
    ]),
  ];
  const csv = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="objednavky.csv"` } });
}
