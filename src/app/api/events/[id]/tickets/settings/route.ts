import crypto from "crypto";
import { saleReadiness } from "@/lib/tickets-server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { isOrgAdmin } from "@/lib/org-scope";
import { readPriceRules } from "@/lib/price-rules";
import { MAX_PER_ORDER_LIMIT, readTicketSettings, ticketTypes } from "@/lib/tickets";
import { extractGoogleDocId } from "@/lib/document-merge";
import { intervalOf } from "@/lib/bank/check-schedule";

// Vstupenky settings of a public event (docs/public-event-tickets-spec.md): price types + limits
// (stored as the event's price rules, src/lib/price-rules.ts), max per order, total limit, VS prefix,
// sales end, place, payment account + the Fio check, the portal switch and the secret scan link.
// Reading: the module; changing (money, links): organization admins.
const scanUrl = (token: string | null) => (token ? `${process.env.APP_BASE_URL ?? ""}/vstup/${token}` : null);

async function view(eventId: string) {
  const e = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  return {
    types: ticketTypes(readPriceRules(e.priceRules)),
    settings: readTicketSettings(e.ticketSettings, e.startDate),
    registrationDeadline: e.registrationDeadline?.toISOString().slice(0, 10) ?? "",
    location: e.location ?? "",
    portalInfo: e.portalInfo ?? "",
    accountNumber: e.registrationBankAccountNumber ?? "",
    bankCode: e.registrationBankCode ?? "",
    bankCheckEnabled: e.bankCheckEnabled,
    bankCheckIntervalMin: intervalOf(e.bankCheckIntervalMin),
    bankAccountId: e.bankAccountId,
    portalOpen: e.portalOpen,
    senderEmail: e.senderEmail,
    scanLink: scanUrl(e.ticketScanToken),
    // R4-10 (audit2): what paid orders need -- the order route refuses them without it.
    ready: await saleReadiness(e),
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const denied = await requireModuleAccess(user, id, "tickets");
  if (denied) return denied;
  return NextResponse.json(await view(id));
}

const int = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const denied = await requireModuleAccess(user, id, "tickets");
  if (denied) return denied;
  if (!isOrgAdmin(user)) return NextResponse.json({ error: "admin_only" }, { status: 403 });
  const event = await prisma.event.findUniqueOrThrow({ where: { id } });
  if (event.kind !== "public_event") return NextResponse.json({ error: "not_public_event" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // Secret scan link: a new one replaces the old (the old link stops working), or none.
  if (b.scanLink === "new" || b.scanLink === "revoke") {
    await prisma.event.update({ where: { id }, data: { ticketScanToken: b.scanLink === "new" ? crypto.randomBytes(24).toString("base64url") : null } });
    return NextResponse.json(await view(id));
  }

  // Google Doc ticket template on its own (a link or an id; "" = back to the text template).
  if (typeof b.docTemplate === "string") {
    const docTemplate = b.docTemplate.trim() ? extractGoogleDocId(b.docTemplate) : null;
    if (docTemplate && !/^[\w-]{20,}$/.test(docTemplate)) return NextResponse.json({ error: "bad_doc" }, { status: 400 });
    await prisma.event.update({ where: { id }, data: { ticketSettings: { ...readTicketSettings(event.ticketSettings, event.startDate), docTemplate } } });
    return NextResponse.json(await view(id));
  }

  // Texts on the public form + "zbývá N" switch, on their own (cleaned by readTicketSettings).
  if (b.texts !== undefined) {
    const next = readTicketSettings({ ...readTicketSettings(event.ticketSettings, event.startDate), texts: b.texts, showLeft: b.showLeft !== false }, event.startDate);
    await prisma.event.update({ where: { id }, data: { ticketSettings: next } });
    return NextResponse.json(await view(id));
  }

  // Price types: label + price + optional limit; the key stays (sold tickets refer to it).
  const rawTypes = Array.isArray(b.types) ? b.types.slice(0, 20) : [];
  const categories = rawTypes.map((raw, i) => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const key = text(r.key, 40).replace(/[^a-zA-Z0-9_-]/g, "") || `t${Date.now().toString(36)}${i}`;
    return { key, label: text(r.label, 120), priceCzk: int(r.priceCzk, 0, 1_000_000), capacity: int(r.capacity, 1, 1_000_000), forAdults: true, forChildren: false };
  });
  if (categories.length === 0 || categories.some((c) => !c.label || c.priceCzk === undefined)) return NextResponse.json({ error: "bad_types" }, { status: 400 });
  if (new Set(categories.map((c) => c.key)).size !== categories.length) return NextResponse.json({ error: "bad_types" }, { status: 400 });
  // A type with sold tickets can't disappear.
  const sold = await prisma.ticket.findMany({ where: { eventId: id, order: { status: { not: "cancelled" } } }, distinct: ["priceKey"], select: { priceKey: true } });
  if (sold.some((s) => !categories.some((c) => c.key === s.priceKey))) return NextResponse.json({ error: "type_in_use" }, { status: 400 });

  const maxPerOrder = int(b.maxPerOrder, 1, MAX_PER_ORDER_LIMIT);
  const totalCapacity = b.totalCapacity === null ? null : int(b.totalCapacity, 1, 1_000_000);
  const vsPrefix = typeof b.vsPrefix === "string" && /^\d{1,6}$/.test(b.vsPrefix) ? b.vsPrefix : undefined;
  if (maxPerOrder === undefined || totalCapacity === undefined || vsPrefix === undefined) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  // The VS of existing orders is fixed; a new prefix only for the next ones -- but never one another
  // event on the same account already uses (payments would match the wrong order).
  const deadline = text(b.registrationDeadline, 10);
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const accountNumber = text(b.accountNumber, 30).replace(/\s/g, "");
  const bankCode = text(b.bankCode, 4);
  const wantCheck = b.bankCheckEnabled === true;
  const bankAccountId = typeof b.bankAccountId === "string" && b.bankAccountId ? b.bankAccountId : null;
  const account = bankAccountId ? await prisma.bankAccount.findFirst({ where: { id: bankAccountId, organizationId: event.organizationId } }) : null;
  if (bankAccountId && !account) return NextResponse.json({ error: "bank_check_account" }, { status: 400 });
  if (wantCheck && (!account || !account.tokenEncrypted || account.accountNumber !== accountNumber || account.bankCode !== bankCode)) return NextResponse.json({ error: "bank_check_account" }, { status: 400 });
  if (wantCheck && account) {
    const clash = await prisma.event.findFirst({ where: { id: { not: id }, kind: "public_event", bankAccountId: account.id, bankCheckEnabled: true }, select: { ticketSettings: true, startDate: true, name: true } });
    if (clash && readTicketSettings(clash.ticketSettings, clash.startDate).vsPrefix === vsPrefix) return NextResponse.json({ error: "vs_prefix_taken", name: clash.name }, { status: 400 });
  }

  await prisma.event.update({
    where: { id },
    data: {
      priceRules: { categories: categories.map(({ capacity, ...c }) => (capacity ? { ...c, capacity } : c)), schoolYearFrom: "09-01", householdMinMembers: 2 },
      ticketSettings: { ...readTicketSettings(event.ticketSettings, event.startDate), maxPerOrder, totalCapacity, vsPrefix },
      registrationDeadline: deadline ? new Date(deadline) : null,
      location: text(b.location, 300) || null,
      portalInfo: text(b.portalInfo, 2000) || null,
      registrationBankAccountNumber: accountNumber || null,
      registrationBankCode: bankCode || null,
      bankCheckEnabled: wantCheck,
      ...(b.bankCheckIntervalMin !== undefined && { bankCheckIntervalMin: intervalOf(Number(b.bankCheckIntervalMin)) }),
      bankAccountId: account?.id ?? null,
      portalOpen: b.portalOpen === true,
    },
  });
  return NextResponse.json(await view(id));
}
