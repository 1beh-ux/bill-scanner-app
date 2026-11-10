import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEnabledModules, hasModuleAccess } from "@/lib/module-access";
import { adultsOn } from "@/lib/module-kinds";
import { isOrgAdmin } from "@/lib/org-scope";

// Used by the sidebar to decide which module nav items to show: only
// modules that are both enabled for this event AND granted to this user
// (or covered by their role shortcut) come back true.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;

  const enabledModules = await getEnabledModules(eventId);
  const accessible: Record<string, boolean> = {};
  for (const key of enabledModules) {
    accessible[key] = await hasModuleAccess(user, eventId, key);
  }

  // "Lidé na akci" switches nobody is granted (src/lib/module-kinds.ts): Přihláška and Portál for whoever
  // reaches the roster; Dospělí (its switch or Kuchyně) for whoever has Účtenky, Děti or Kuchyně.
  const roster = !!(accessible.participants || accessible.health || accessible.mail);
  const on = new Set<string>(enabledModules);
  accessible.registration = on.has("registration") && roster;
  accessible.portal = on.has("portal") && roster;
  accessible.adults = adultsOn(on) && (isOrgAdmin(user) || !!(accessible.kitchen || accessible.participants || accessible.bills));

  // Not a module: "Platby na účet" shows under Účastníci when the event checks the bank
  // (docs/bank-payments-design.md) and the user reaches the roster.
  if (roster) {
    const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { bankCheckEnabled: true, bankAccountId: true } });
    accessible.bankCheck = !!ev?.bankCheckEnabled && !!ev.bankAccountId;
  }
  return NextResponse.json(accessible);
}
