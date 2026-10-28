// "Potvrdit den": the entries' recipes with quantities are written into recipeSnapshot; library edits
// after that never change them (until "Znovu otevřít").
import { prisma } from "@/lib/prisma";
import { kitchenContext } from "./server";
import { loadPlan } from "./plan-server";

export async function snapshotEntries(event: { id: string; organizationId: string; startDate: Date; endDate: Date }, entryIds: string[]) {
  if (!entryIds.length) return 0;
  const ctx = await kitchenContext(event);
  const rows = await loadPlan(ctx, event.id, event.organizationId, { id: { in: entryIds }, status: "draft" });
  await prisma.$transaction(rows.map((r) => prisma.planEntry.update({ where: { id: r.id }, data: { status: "confirmed", recipeSnapshot: r.liveSheet() as object } })));
  return rows.length;
}
