// The orders of a public event as rows (one per order): the CSV download and the Drive sheet
// "Vstupenky – <event>" in the export folder (next to the bills manifest) show the same columns.
import { exportFolder } from "@/lib/drive-folders";
import { prisma } from "@/lib/prisma";
import { sheetText, upsertSheetByName } from "@/lib/drive";
import { itemsLine, scanTime, type OrderItem } from "@/lib/tickets";

const STATUS = { pending: "čeká na platbu", paid: "zaplaceno", cancelled: "zrušeno" } as const;
const when = (d: Date | null) => d?.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" }) ?? "";

export async function orderRows(eventId: string): Promise<(string | number)[][]> {
  const orders = await prisma.ticketOrder.findMany({ where: { eventId }, orderBy: { number: "asc" }, include: { tickets: { select: { seq: true, usedAt: true }, orderBy: { seq: "asc" } } } });
  return [
    ["Číslo", "Vytvořeno", "Jméno", "E-mail", "Telefon", "Vstupenky", "Počet", "Celkem Kč", "VS", "Stav", "Zaplaceno", "Odesláno", "U vchodu", "Čas vstupu", "Poznámka"],
    ...orders.map((o) => [
      o.number,
      when(o.createdAt),
      o.buyerName,
      o.email,
      o.phone ?? "",
      itemsLine(o.items as OrderItem[]),
      o.tickets.length,
      o.totalCzk,
      o.variableSymbol,
      STATUS[o.status],
      when(o.paidAt),
      when(o.ticketsSentAt),
      o.tickets.filter((t) => t.usedAt).length,
      o.tickets.filter((t) => t.usedAt).map((t) => `${t.seq}: ${scanTime(t.usedAt!)}`).join(", "),
      o.note ?? "",
    ]),
  ];
}

/** The orders -> the sheet "Vstupenky – <event>" in the export folder (rewritten each time). */
export async function exportOrdersToDrive(eventId: string): Promise<{ count: number; spreadsheetId: string } | { error: "no_export_folder" }> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true, driveExportFolderId: true, driveTicketsFolderId: true } });
  // The tickets' own folder (Připojení), else the bill export folder.
  const folder = exportFolder(event, "tickets");
  if (!folder) return { error: "no_export_folder" };
  const rows = (await orderRows(eventId)).map((r) => r.map((v) => (typeof v === "string" ? sheetText(v) : v)));
  return { count: rows.length - 1, spreadsheetId: await upsertSheetByName(eventId, folder, `Vstupenky – ${event.name}`, rows) };
}
