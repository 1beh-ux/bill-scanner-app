// Veřejná akce, server side (docs/public-event-tickets-spec.md): orders, the three automatic
// e-mails, payment (bank check / by hand), cancelling and the door check-in. The pure rules are
// in src/lib/tickets.ts.
import crypto from "crypto";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import type { Event, TicketOrder, Ticket } from "@/generated/prisma";
import { readPriceRules } from "@/lib/price-rules";
import { itemsLine, orderVs, readTicketSettings, ticketTypes, validateOrder, type OrderItem, type ScanResult } from "@/lib/tickets";
import { resolveEmailTemplate, senderIdentity, substituteVariables } from "@/lib/email-template";
import { TICKET_CANCEL_PURPOSE_KEY, TICKET_DOCUMENT_PURPOSE_KEY, TICKET_ORDER_PURPOSE_KEY, TICKET_SEND_PURPOSE_KEY } from "@/lib/email-template-purpose-keys";
import { eventSender } from "@/lib/auto-accept";
import { sendEmailWithOptionalAttachment } from "@/lib/mail";
import { templateFiles } from "@/lib/email-files";
import { inlineMark, type InlineImage } from "@/lib/mail-mime";
import { buildSpaydString, czechAccountToIban } from "@/lib/qr-platba";
import { renderTicketsPdf } from "@/lib/tickets-pdf";

type OrderWithTickets = TicketOrder & { tickets: Ticket[] };

// No 0/O, 1/I: read out or typed at the door without mix-ups.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** 12 random characters (~60 bits): the QR content, never derived from ids. */
export function newTicketCode(): string {
  return Array.from(crypto.randomBytes(12), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
export const formatTicketCode = (code: string) => code.match(/.{1,4}/g)?.join("-") ?? code;

const startOfToday = () => new Date(new Date().toISOString().slice(0, 10));

/** The public event a slug opens for ticket sales -- like publicEvent(), for kind public_event. */
export const isOnSale = (e: Pick<Event, "kind" | "status" | "registrationDeadline">) => e.kind === "public_event" && e.status === "active" && (!e.registrationDeadline || e.registrationDeadline >= startOfToday());

/** Tickets of orders not cancelled, per price type. */
export async function soldCounts(eventId: string, db: Pick<typeof prisma, "ticket"> = prisma): Promise<Record<string, number>> {
  const rows = await db.ticket.groupBy({ by: ["priceKey"], where: { eventId, order: { status: { not: "cancelled" } } }, _count: true });
  return Object.fromEntries(rows.map((r) => [r.priceKey, r._count]));
}

export function eventSaleSetup(event: Pick<Event, "priceRules" | "ticketSettings" | "startDate">) {
  return { types: ticketTypes(readPriceRules(event.priceRules)), settings: readTicketSettings(event.ticketSettings, event.startDate) };
}

/**
 * A new order: validated again inside a per-event row lock (two buyers can't both get the last
 * ticket), numbered, its tickets created with their codes. Then the order e-mail goes out (a failed
 * send is kept in sendError, the order stays).
 */
export async function createTicketOrder(event: Event, body: unknown, source: "public" | "portal"): Promise<{ ok: true; order: OrderWithTickets } | { ok: false; errors: string[] }> {
  const { types, settings } = eventSaleSetup(event);
  // R4-10 (audit2): a paid order needs somewhere to pay to and a mailbox to send the details from.
  const ready = await saleReadiness(event);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${event.id} FOR UPDATE`;
    const checked = validateOrder(body, { types, settings, sold: await soldCounts(event.id, tx) });
    if (!checked.ok) return checked;
    if (checked.data.totalCzk > 0 && !(ready.account && ready.sender)) return { ok: false as const, errors: ["payment_not_ready"] };
    const last = await tx.ticketOrder.aggregate({ where: { eventId: event.id }, _max: { number: true } });
    const number = (last._max.number ?? 0) + 1;
    const { items, ...buyer } = checked.data;
    let seq = 0;
    const order = await tx.ticketOrder.create({
      data: {
        eventId: event.id,
        number,
        variableSymbol: orderVs(settings.vsPrefix, number),
        buyerName: buyer.buyerName,
        email: buyer.email,
        phone: buyer.phone,
        note: buyer.note || null,
        items,
        totalCzk: buyer.totalCzk,
        source,
        publicToken: crypto.randomBytes(24).toString("base64url"),
        tickets: { create: items.flatMap((i) => Array.from({ length: i.count }, () => ({ eventId: event.id, code: newTicketCode(), seq: ++seq, priceKey: i.key, priceLabel: i.label }))) },
      },
      include: { tickets: { orderBy: { seq: "asc" } } },
    });
    return { ok: true as const, order };
  });
  if (!result.ok) return result;
  // Free order (all prices 0): nothing to pay, the tickets go out at once.
  if (result.order.totalCzk === 0) await markTicketOrderPaid(result.order.id, { via: "manual", userId: null });
  else await sendOrderMail(result.order.id, TICKET_ORDER_PURPOSE_KEY);
  return result;
}

/** R4-10 (audit2): can this event take paid orders -- a payment account and a connected sender mailbox. */
export async function saleReadiness(event: Pick<Event, "registrationBankAccountNumber" | "registrationBankCode" | "senderEmail">) {
  return { account: !!(event.registrationBankAccountNumber && event.registrationBankCode), sender: !!(await eventSender(event)) };
}

/** "123456789/2010" + the SPAYD QR payload of the order (null = the event's account isn't usable). */
export function paymentInfo(event: Pick<Event, "registrationBankAccountNumber" | "registrationBankCode" | "name">, order: Pick<TicketOrder, "totalCzk" | "variableSymbol" | "number">) {
  const account = event.registrationBankAccountNumber && event.registrationBankCode ? `${event.registrationBankAccountNumber}/${event.registrationBankCode}` : null;
  const iban = account ? czechAccountToIban(event.registrationBankAccountNumber!, event.registrationBankCode!) : null;
  const spayd = iban ? buildSpaydString(iban, order.totalCzk, `${event.name} obj ${order.number}`, order.variableSymbol) : null;
  return { account, spayd };
}

const dateCs = (d: Date) => d.toLocaleDateString("cs-CZ", { timeZone: "UTC" });
const dateRange = (a: Date, b: Date) => (dateCs(a) === dateCs(b) ? dateCs(a) : `${dateCs(a)} – ${dateCs(b)}`);

async function orderContext(orderId: string) {
  const order = await prisma.ticketOrder.findUniqueOrThrow({ where: { id: orderId }, include: { tickets: { orderBy: { seq: "asc" } }, event: { include: { organization: { select: { name: true } } } } } });
  const sender = await eventSender(order.event);
  const user = sender ? await prisma.user.findUnique({ where: { id: sender.userId } }) : null;
  const signature = senderIdentity(user, order.event.organization.name).signature;
  const pay = paymentInfo(order.event, order);
  const vars: Record<string, string> = {
    event_name: order.event.name,
    event_date: dateRange(order.event.startDate, order.event.endDate),
    event_place: order.event.location ?? "",
    buyer_name: order.buyerName,
    order_number: String(order.number),
    order_items: itemsLine(order.items as OrderItem[]),
    order_total: `${order.totalCzk} Kč`,
    ticket_count: String(order.tickets.length),
    sender_email: sender?.email ?? "",
    signature,
    organization_name: order.event.organization.name,
    payment_account: pay.account ?? "",
    variable_symbol: order.variableSymbol,
    // Payment details for the e-mail text (2026-10-23); {{payment_qr}} = the QR image right in the text.
    payment_amount: `${order.totalCzk} Kč`,
    payment_message: `${order.event.name} obj ${order.number}`,
    payment_iban: pay.account ? (czechAccountToIban(order.event.registrationBankAccountNumber ?? "", order.event.registrationBankCode ?? "") ?? "") : "",
    payment_qr: pay.spayd ? inlineMark("payment_qr") : "",
    payment_details: pay.account
      ? [`Číslo účtu: ${pay.account}`, `Částka: ${order.totalCzk} Kč`, `Variabilní symbol: ${order.variableSymbol}`].join("\n")
      : "",
  };
  return { order, sender, vars, pay };
}

/** The tickets PDF of an order (admin download, the tickets e-mail, the settings preview). */
export async function ticketsPdfOf(orderId: string): Promise<Buffer> {
  const { order, vars } = await orderContext(orderId);
  const template = (await resolveEmailTemplate(order.eventId, TICKET_DOCUMENT_PURPOSE_KEY)).body;
  const { docTemplate } = readTicketSettings(order.event.ticketSettings, order.event.startDate);
  return renderTicketsPdf(
    template,
    order.tickets.map((t) => ({ code: t.code, vars: { ...vars, ticket_no: String(t.seq), ticket_code: formatTicketCode(t.code), price_type: t.priceLabel } })),
    docTemplate ? { eventId: order.eventId, docId: docTemplate } : undefined
  );
}

/**
 * One of the three automatic e-mails, as the event's sending account. Never throws: the outcome
 * is in sendError (null = sent) / ticketsSentAt, which the orders page shows.
 */
export async function sendOrderMail(orderId: string, purposeKey: string): Promise<boolean> {
  try {
    const { order, sender, vars, pay } = await orderContext(orderId);
    if (!sender) throw new Error("no_sender");
    const template = await resolveEmailTemplate(order.eventId, purposeKey);
    const attachments: { buffer: Buffer; filename: string; mimeType: string }[] = [];
    const inline: InlineImage[] = [];
    // The payment QR: inside the text where the template has {{payment_qr}}, else attached (order e-mail).
    const wantsQr = pay.spayd && (template.body.includes("{{payment_qr}}") || purposeKey === TICKET_ORDER_PURPOSE_KEY);
    if (wantsQr) {
      const qr = await QRCode.toBuffer(pay.spayd!, { width: 400, margin: 2 });
      if (template.body.includes("{{payment_qr}}")) inline.push({ cid: "payment_qr", buffer: qr, mimeType: "image/png", alt: "QR platba" });
      else attachments.push({ buffer: qr, filename: "qr-platba.png", mimeType: "image/png" });
    }
    if (purposeKey === TICKET_SEND_PURPOSE_KEY) attachments.push({ buffer: await ticketsPdfOf(orderId), filename: `vstupenky-${order.number}.pdf`, mimeType: "application/pdf" });
    attachments.push(...(await templateFiles(order.event.organizationId, order.eventId, purposeKey)));
    await sendEmailWithOptionalAttachment({
      to: order.email,
      fromName: order.event.organization.name,
      senderEmail: sender.email,
      subject: substituteVariables(template.subject, vars),
      body: substituteVariables(template.body, vars),
      attachments,
      inline,
    });
    await prisma.ticketOrder.update({ where: { id: orderId }, data: { sendError: null, ...(purposeKey === TICKET_SEND_PURPOSE_KEY && { ticketsSentAt: new Date() }) } });
    return true;
  } catch (err) {
    const code = err instanceof Error ? err.message.slice(0, 200) : "send_failed";
    console.log(`[tickets] ${purposeKey} for order ${orderId} failed: ${code}`);
    await prisma.ticketOrder.update({ where: { id: orderId }, data: { sendError: `${purposeKey}: ${code}` } }).catch(() => {});
    return false;
  }
}

/** pending -> paid (only once), then the tickets e-mail. False = it wasn't pending. */
export async function markTicketOrderPaid(orderId: string, o: { via: "bank" | "manual"; userId: string | null; movementRowId?: string }): Promise<boolean> {
  const done = await prisma.$transaction(async (tx) => {
    const { count } = await tx.ticketOrder.updateMany({ where: { id: orderId, status: "pending" }, data: { status: "paid", paidAt: new Date(), paidVia: o.via, paidByUserId: o.userId } });
    if (o.movementRowId) {
      await tx.bankMovement.update({ where: { id: o.movementRowId }, data: count ? { status: "settled", reason: null, ticketOrderId: orderId } : { status: "review", reason: "duplicate", ticketOrderId: orderId } });
    }
    return count > 0;
  });
  if (done) await sendOrderMail(orderId, TICKET_SEND_PURPOSE_KEY);
  return done;
}

/** Cancel: its tickets stop working (scan = cancelled) and go back on sale; the buyer is told. */
export async function cancelTicketOrder(orderId: string, userId: string): Promise<boolean> {
  const { count } = await prisma.ticketOrder.updateMany({ where: { id: orderId, status: { not: "cancelled" } }, data: { status: "cancelled", cancelledAt: new Date(), cancelledById: userId } });
  if (count) await sendOrderMail(orderId, TICKET_CANCEL_PURPOSE_KEY);
  return count > 0;
}

/** The door: a code of THIS event, paid, not used yet -> marked used now (once, even when two phones scan it). */
export async function scanTicket(eventId: string, code: string, by: string): Promise<ScanResult> {
  const ticket = code ? await prisma.ticket.findUnique({ where: { code }, include: { order: { select: { status: true, buyerName: true, number: true, _count: { select: { tickets: true } } } } } }) : null;
  if (!ticket || ticket.eventId !== eventId) return { status: "unknown" };
  if (ticket.order.status === "cancelled") return { status: "cancelled", buyerName: ticket.order.buyerName };
  if (ticket.order.status === "pending") return { status: "unpaid", buyerName: ticket.order.buyerName };
  const { count } = await prisma.ticket.updateMany({ where: { id: ticket.id, usedAt: null }, data: { usedAt: new Date(), usedBy: by } });
  if (!count) {
    const used = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { usedAt: true } });
    return { status: "used", usedAt: used.usedAt!.toISOString(), buyerName: ticket.order.buyerName, priceLabel: ticket.priceLabel };
  }
  return { status: "valid", buyerName: ticket.order.buyerName, priceLabel: ticket.priceLabel, seq: ticket.seq, count: ticket.order._count.tickets, orderNumber: ticket.order.number };
}

/** At the door: paid tickets, already in. */
export async function doorCounts(eventId: string) {
  const [paid, used] = await Promise.all([
    prisma.ticket.count({ where: { eventId, order: { status: "paid" } } }),
    prisma.ticket.count({ where: { eventId, order: { status: "paid" }, usedAt: { not: null } } }),
  ]);
  return { paid, used };
}

/** Bank check (src/lib/bank/check.ts): orders of public events checking this account, as matcher candidates. */
export async function ticketOrderCandidates(bankAccountId: string) {
  const orders = await prisma.ticketOrder.findMany({
    where: { event: { kind: "public_event", bankAccountId, bankCheckEnabled: true }, totalCzk: { gt: 0 } },
    select: { id: true, variableSymbol: true, totalCzk: true, status: true, createdAt: true },
  });
  return orders.map((o) => ({ orderId: o.id, vs: o.variableSymbol, expected: o.totalCzk, paid: o.status !== "pending", createdAt: o.createdAt }));
}
