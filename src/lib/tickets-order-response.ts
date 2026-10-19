// What the buyer sees right after ordering (public page and portal): how to pay, incl. the QR.
import QRCode from "qrcode";
import type { Event, TicketOrder } from "@/generated/prisma";
import { paymentInfo } from "@/lib/tickets-server";

export async function orderConfirmation(event: Event, order: TicketOrder) {
  const pay = paymentInfo(event, order);
  return {
    number: order.number,
    totalCzk: order.totalCzk,
    variableSymbol: order.variableSymbol,
    account: pay.account,
    qr: pay.spayd ? await QRCode.toDataURL(pay.spayd, { width: 320, margin: 2 }) : null,
    // "Zkontrolovat platbu" (POST /api/public/tickets/<token>); only when the bank check can answer.
    statusToken: event.bankCheckEnabled && event.bankAccountId ? order.publicToken : null,
    paid: order.status === "paid",
  };
}
