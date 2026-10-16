// Banka (docs/bank-reconciliation.md): every /api/events/[id]/bank/** route goes through
// requireBank -- the event in the acting organization, the module switched on for it, and an explicit
// `bank` grant (admins included, src/lib/module-access.ts). Accounts are reached only through an
// event they're linked to.
import { NextResponse } from "next/server";
import type { Event, User } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { notFound } from "@/lib/org-scope";

export type BankCtx = { user: User; event: Event };

export async function requireBank(eventId: string): Promise<{ error: NextResponse } | BankCtx> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const denied = await requireModuleAccess(user, eventId, "bank");
  if (denied) return { error: denied };
  const enabled = await prisma.eventModule.findUnique({ where: { eventId_moduleKey: { eventId, moduleKey: "bank" } }, select: { enabled: true } });
  if (!enabled?.enabled) return { error: NextResponse.json({ error: "module_disabled" }, { status: 403 }) };
  return { user, event: await prisma.event.findUniqueOrThrow({ where: { id: eventId } }) };
}

/** The account if it's linked to this event (with its window), else a 404 response. */
export async function linkedAccount(eventId: string, bankAccountId: string) {
  const link = typeof bankAccountId === "string" ? await prisma.eventBankAccount.findUnique({ where: { eventId_bankAccountId: { eventId, bankAccountId } }, include: { bankAccount: true } }) : null;
  return link ?? notFound();
}

/** Does this user have Banka in this event? (For Bills screens deciding what to show.) */
export async function hasBankAccess(user: User, eventId: string): Promise<boolean> {
  return (await requireModuleAccess(user, eventId, "bank")) === null && !!(await prisma.eventModule.findFirst({ where: { eventId, moduleKey: "bank", enabled: true }, select: { eventId: true } }));
}
