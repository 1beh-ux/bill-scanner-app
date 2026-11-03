// Vozidla (travel orders A3): organization admins manage every car; a user with Bills access on an event lists
// the cars of that event's people (adults in Lidé assigned to it, its payers, and whoever those are linked to)
// and adds cars for them, editing only the ones they added.
import { Prisma, type User, type VehicleFuel, type VehicleGearbox } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { FUELS, GEARBOXES } from "@/lib/travel-order-calc";

/** The event's people: adult ids and payer ids, each widened by the Author.childId soft links. */
export async function eventPeople(eventId: string): Promise<{ childIds: string[]; authorIds: string[] }> {
  const [persons, access] = await Promise.all([
    prisma.eventPerson.findMany({ where: { eventId, child: { isAdult: true } }, select: { childId: true } }),
    prisma.authorEventAccess.findMany({ where: { eventId }, select: { authorId: true, author: { select: { childId: true } } } }),
  ]);
  const childIds = new Set([...persons.map((p) => p.childId), ...access.map((a) => a.author.childId).filter((x): x is string => !!x)]);
  const linked = await prisma.author.findMany({ where: { childId: { in: [...childIds] } }, select: { id: true } });
  return { childIds: [...childIds], authorIds: [...new Set([...access.map((a) => a.authorId), ...linked.map((a) => a.id)])] };
}

export const vehicleSelect = {
  id: true, label: true, cylinderCc: true, plate: true, gearbox: true, fuel: true,
  tpConsumption1: true, tpConsumption2: true, tpConsumption3: true, tpConsumption4: true,
  ownerChildId: true, ownerAuthorId: true, ownerName: true, createdByUserId: true, archivedAt: true,
  ownerChild: { select: { id: true, name: true } }, ownerAuthor: { select: { id: true, canonicalName: true } },
} satisfies Prisma.VehicleSelect;

const tp = (v: unknown): Prisma.Decimal | null | "bad" => {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().replace(",", ".");
  return /^\d{1,2}(\.\d{1,2})?$/.test(s) ? new Prisma.Decimal(s) : "bad";
};

/**
 * A vehicle body checked against the organization: the owner adult must be an adult of it, the owner payer one
 * of its payers, and at least one owner given. `allowed` limits the owners (a non-admin: the event's people).
 */
export async function parseVehicle(
  b: Record<string, unknown>,
  organizationId: string,
  allowed: { childIds: string[]; authorIds: string[] } | null,
): Promise<{ data: Omit<Prisma.VehicleUncheckedCreateInput, "organizationId"> } | { bad: string[] } | { notFound: true }> {
  const bad: string[] = [];
  const label = typeof b.label === "string" ? b.label.trim().slice(0, 100) : "";
  if (!label) bad.push("label");
  if (!FUELS.includes(b.fuel as never)) bad.push("fuel");
  if (!GEARBOXES.includes(b.gearbox as never)) bad.push("gearbox");
  const cc = b.cylinderCc === null || b.cylinderCc === undefined || b.cylinderCc === "" ? null : Number(b.cylinderCc);
  if (cc !== null && !(Number.isInteger(cc) && cc > 0 && cc < 20000)) bad.push("cylinderCc");
  const tps = [b.tpConsumption1, b.tpConsumption2, b.tpConsumption3, b.tpConsumption4].map(tp);
  tps.forEach((v, i) => v === "bad" && bad.push(`tpConsumption${i + 1}`));
  const ownerChildId = typeof b.ownerChildId === "string" && b.ownerChildId ? b.ownerChildId : null;
  const ownerAuthorId = typeof b.ownerAuthorId === "string" && b.ownerAuthorId ? b.ownerAuthorId : null;
  const ownerName = typeof b.ownerName === "string" ? b.ownerName.trim().slice(0, 200) || null : null;
  if (!ownerChildId && !ownerAuthorId && !ownerName) bad.push("owner");
  if (bad.length) return { bad };
  if (ownerChildId) {
    const c = await prisma.child.findFirst({ where: { id: ownerChildId, organizationId }, select: { isAdult: true } });
    if (!c || (allowed && !allowed.childIds.includes(ownerChildId))) return { notFound: true };
    if (!c.isAdult) return { bad: ["owner"] };
  }
  if (ownerAuthorId && (!(await prisma.author.count({ where: { id: ownerAuthorId, organizationId } })) || (allowed && !allowed.authorIds.includes(ownerAuthorId)))) return { notFound: true };
  // A non-admin adds cars of the event's people only, never a free-text owner.
  if (allowed && !ownerChildId && !ownerAuthorId) return { bad: ["owner"] };
  const plate = typeof b.plate === "string" ? b.plate.trim().toUpperCase().slice(0, 20) || null : null;
  return {
    data: {
      label, plate, cylinderCc: cc, fuel: b.fuel as VehicleFuel, gearbox: b.gearbox as VehicleGearbox,
      tpConsumption1: tps[0] as Prisma.Decimal | null, tpConsumption2: tps[1] as Prisma.Decimal | null,
      tpConsumption3: tps[2] as Prisma.Decimal | null, tpConsumption4: tps[3] as Prisma.Decimal | null,
      ownerChildId, ownerAuthorId, ownerName,
    },
  };
}

/** Can this user edit / archive the vehicle? Admins any; others only one they added. */
export const canEditVehicle = (user: Pick<User, "id" | "role" | "isSuperAdmin">, v: { createdByUserId: string | null }, admin: boolean) => admin || v.createdByUserId === user.id;
