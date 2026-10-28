// Dospělí na akci, server side (2026-10-28): creating an adult in Lidé and the event routes' guard.
// An adult here is a Child with isAdult -- never a Participant, never a family, portal link or e-mail.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { fullNameFrom } from "@/lib/participant-name";
import { ADDRESS_KEYS } from "@/lib/adults";
import { ALLERGEN_CODES, DIET_FLAG_CODES, cleanCodes } from "@/lib/kitchen/allergens";

/** Dospělí na akci routes: the Kuchyně grant on the event (organization admins pass, as for other modules). */
type GuardEvent = { id: string; name: string; organizationId: string; startDate: Date; endDate: Date };
export async function adultsGuard(eventId: string): Promise<{ error: NextResponse } | { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; event: GuardEvent }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const denied = await requireModuleAccess(user, eventId, "kitchen");
  if (denied) return { error: denied };
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { id: true, name: true, organizationId: true, startDate: true, endDate: true } });
  return { user, event };
}

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isoDay = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) ? v : null);

/**
 * "Přidat dospělého": a new adult of the organization with name, birth date, address (the organization's
 * adresa_* fields) and food data -- nothing else. Null = invalid input (a first or last name is required).
 */
export async function createAdult(organizationId: string, raw: unknown): Promise<{ id: string } | null> {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const firstName = text(o.firstName, 100);
  const lastName = text(o.lastName, 100);
  if (!firstName && !lastName) return null;
  const dob = isoDay(o.dateOfBirth);
  const address = Object.fromEntries(
    ([["street", ADDRESS_KEYS.street], ["municipality", ADDRESS_KEYS.municipality], ["zip", ADDRESS_KEYS.zip]] as const)
      .map(([k, key]) => [key, text(o[k])])
      .filter(([, v]) => v)
  );
  return prisma.child.create({
    data: {
      organizationId,
      name: fullNameFrom(firstName || null, lastName || null) || firstName || lastName,
      firstName: firstName || null,
      lastName: lastName || null,
      dateOfBirth: dob ? new Date(dob) : null,
      isAdult: true,
      fieldValues: address,
      allergens: cleanCodes(o.allergens, ALLERGEN_CODES),
      dietFlags: cleanCodes(o.dietFlags, DIET_FLAG_CODES),
      dietNote: text(o.dietNote, 1000) || null,
    },
    select: { id: true },
  });
}

export { isoDay };
