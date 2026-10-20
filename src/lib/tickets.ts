// Veřejná akce -- ticket sales (docs/public-event-tickets-spec.md). Pure: no DB, no Node-only
// imports, so the order form, the settings and the self-check (src/lib/tickets.check.ts) use it too.
// Price types are the event's price rules categories (src/lib/price-rules.ts) with an optional
// capacity; the rest of the setup is Event.ticketSettings.
import type { PriceRules } from "@/lib/price-rules";

export type TicketSettings = {
  // Most tickets one order may have.
  maxPerOrder: number;
  // All price types together; null = only the per-type limits.
  totalCapacity: number | null;
  // Digits the variable symbol starts with; the order number (4 digits) follows.
  vsPrefix: string;
  // Google Doc the ticket is made from (logo, fonts, design); null = the markdown template.
  docTemplate: string | null;
  // Show "zbývá N" next to each price type (sold out is shown either way).
  showLeft: boolean;
  // The event's own wording of the public form texts (TICKET_TEXT_KEYS, without "ticketForm."); missing = default.
  texts: Record<string, string>;
};

// Public ticket form texts an event may reword (Nastavení akce -> Vstupenky -> Texty na webu), in screen order.
export const TICKET_TEXT_KEYS = [
  "kicker", "salesUntil", "ticketsTitle", "total", "maxHint", "name", "email", "phone", "note", "submit", "soldOut", "notReady",
  "doneTitle", "payHint", "emailHint", "checkPayment", "checkHint", "paidNow", "doneFree",
] as const;
export const TICKET_TEXT_MAX = 1000;

/** The translator with an event's own texts on top ({var}s filled in the same way). */
export function withTicketTexts(t: (key: string, vars?: Record<string, string>) => string, texts: Record<string, string> | undefined) {
  return (key: string, vars?: Record<string, string>) => {
    const own = key.startsWith("ticketForm.") ? texts?.[key.slice("ticketForm.".length)] : undefined;
    if (!own) return t(key, vars);
    let s = own;
    for (const [k, v] of Object.entries(vars ?? {})) s = s.split(`{${k}}`).join(v);
    return s;
  };
}

function readTexts(raw: unknown): Record<string, string> {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of TICKET_TEXT_KEYS) if (typeof o[k] === "string" && (o[k] as string).trim()) out[k] = (o[k] as string).trim().slice(0, TICKET_TEXT_MAX);
  return out;
}

export type TicketType = { key: string; label: string; priceCzk: number; capacity: number | null };
export type OrderItem = { key: string; label: string; priceCzk: number; count: number };
export type CleanOrder = { buyerName: string; email: string; phone: string | null; note: string; items: OrderItem[]; totalCzk: number };

export const MAX_PER_ORDER_LIMIT = 50;
export const ORDER_LIMIT_PER_HOUR = 10;

const int = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null);

/** Two-digit year of the event + "9": e.g. 269 -> VS 2690001, 2690002 ... */
export const defaultVsPrefix = (eventStart: Date) => `${String(eventStart.getUTCFullYear() % 100).padStart(2, "0")}9`;

/** Stored (untrusted) JSON -> settings, defaults filled in. */
export function readTicketSettings(raw: unknown, eventStart: Date): TicketSettings {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return {
    maxPerOrder: int(o.maxPerOrder, 1, MAX_PER_ORDER_LIMIT) ?? 10,
    totalCapacity: int(o.totalCapacity, 1, 1_000_000),
    vsPrefix: typeof o.vsPrefix === "string" && /^\d{1,6}$/.test(o.vsPrefix) ? o.vsPrefix : defaultVsPrefix(eventStart),
    docTemplate: typeof o.docTemplate === "string" && /^[\w-]{20,}$/.test(o.docTemplate) ? o.docTemplate : null,
    showLeft: o.showLeft !== false,
    texts: readTexts(o.texts),
  };
}

export const ticketTypes = (rules: PriceRules | null): TicketType[] =>
  (rules?.categories ?? []).map((c) => ({ key: c.key, label: c.label, priceCzk: c.priceCzk, capacity: c.capacity ?? null }));

/** Variable symbol of order `number`: prefix + the number on 4 digits (max 10 digits). */
export const orderVs = (prefix: string, number: number) => `${prefix}${String(number).padStart(4, "0")}`.slice(0, 10);

/** Tickets still on sale: per type and in total (null = no limit). `sold` counts tickets of orders not cancelled. */
export function remaining(types: TicketType[], settings: TicketSettings, sold: Record<string, number>): { perType: Record<string, number | null>; total: number | null } {
  const soldTotal = Object.values(sold).reduce((a, b) => a + b, 0);
  const total = settings.totalCapacity === null ? null : Math.max(0, settings.totalCapacity - soldTotal);
  const perType: Record<string, number | null> = {};
  for (const t of types) {
    const own = t.capacity === null ? null : Math.max(0, t.capacity - (sold[t.key] ?? 0));
    perType[t.key] = own === null ? total : total === null ? own : Math.min(own, total);
  }
  return { perType, total };
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 200;

/**
 * One order from the form -> clean order or error codes: "name", "email", "count" (nothing
 * picked), "max" (over maxPerOrder), "sold_out.<key>" / "sold_out" (not enough left).
 * The server runs it again inside the per-event lock with fresh `sold` numbers.
 */
export function validateOrder(
  body: unknown,
  ctx: { types: TicketType[]; settings: TicketSettings; sold: Record<string, number> }
): { ok: true; data: CleanOrder } | { ok: false; errors: string[] } {
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const buyerName = str(o.buyerName, 120);
  const email = str(o.email);
  const phone = str(o.phone, 40) || null;
  if (!buyerName) errors.push("name");
  if (!isEmail(email)) errors.push("email");

  const counts = (o.counts && typeof o.counts === "object" ? o.counts : {}) as Record<string, unknown>;
  const items: OrderItem[] = [];
  for (const t of ctx.types) {
    const n = int(counts[t.key], 0, MAX_PER_ORDER_LIMIT) ?? 0;
    if (n > 0) items.push({ key: t.key, label: t.label, priceCzk: t.priceCzk, count: n });
  }
  const count = items.reduce((a, i) => a + i.count, 0);
  if (count === 0) errors.push("count");
  else if (count > ctx.settings.maxPerOrder) errors.push("max");
  else {
    const left = remaining(ctx.types, ctx.settings, ctx.sold);
    for (const i of items) if (left.perType[i.key] !== null && i.count > left.perType[i.key]!) errors.push(`sold_out.${i.key}`);
    if (left.total !== null && count > left.total && !errors.some((e) => e.startsWith("sold_out"))) errors.push("sold_out");
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, data: { buyerName, email, phone, note: str(o.note, 1000), items, totalCzk: items.reduce((a, i) => a + i.priceCzk * i.count, 0) } };
}

/** "2× Vstupné (300 Kč), 1× Student (150 Kč)" */
export const itemsLine = (items: OrderItem[]) => items.map((i) => `${i.count}× ${i.label} (${i.priceCzk} Kč)`).join(", ");

/** What a scan answers. */
export type ScanResult =
  | { status: "valid"; buyerName: string; priceLabel: string; seq: number; count: number; orderNumber: number }
  | { status: "used"; usedAt: string; buyerName: string; priceLabel: string }
  | { status: "unpaid" | "cancelled"; buyerName: string }
  | { status: "unknown" };

/** The code from a scan: the QR holds it bare, a hand-typed one may have spaces / lowercase. */
export const normalizeTicketCode = (raw: unknown) => (typeof raw === "string" ? raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32) : "");
