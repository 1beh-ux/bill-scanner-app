import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getDriveIdentity } from "@/lib/drive";

// Read-only overview of every event for admins: who has access, whose Google
// account runs its Drive (and whether that fell back to the service account),
// bills by status, budget vs spent (same definition as the budget page: every
// bill's category amounts, any status), payers. Plus every connected Google account.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "admin_only" }, { status: 403 });

  const events = await prisma.event.findMany({ orderBy: { startDate: "desc" } });

  const rows = await Promise.all(
    events.map(async (e) => {
      const [access, statusCounts, budget, spent, payers, identity, configuredBy] = await Promise.all([
        prisma.userEventModuleAccess.findMany({ where: { eventId: e.id }, distinct: ["userId"], select: { userId: true } }),
        prisma.bill.groupBy({ by: ["status"], where: { eventId: e.id }, _count: { _all: true } }),
        prisma.eventCategory.aggregate({ where: { eventId: e.id }, _sum: { budgetAmount: true } }),
        prisma.billCategory.aggregate({ where: { bill: { eventId: e.id } }, _sum: { amountCzk: true } }),
        prisma.authorEventAccess.count({ where: { eventId: e.id } }),
        getDriveIdentity(e.id),
        e.driveConfiguredByUserId
          ? prisma.user.findUnique({ where: { id: e.driveConfiguredByUserId }, select: { displayName: true, active: true } })
          : null,
      ]);
      const hasFolders = !!(e.driveIngestFolderId || e.driveExportFolderId || e.driveParticipantsFolderId);
      return {
        id: e.id,
        name: e.name,
        status: e.status,
        usersWithAccess: access.length,
        billsByStatus: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])),
        budgetCzk: (budget._sum.budgetAmount ?? new Prisma.Decimal(0)).toString(),
        spentCzk: (spent._sum.amountCzk ?? new Prisma.Decimal(0)).toString(),
        payers,
        drive: {
          hasFolders,
          kind: identity.kind,
          email: identity.email,
          warning: identity.warning ?? null,
          configuredBy: configuredBy?.displayName ?? null,
          configuredByActive: configuredBy?.active ?? null,
        },
      };
    })
  );

  const accounts = await prisma.driveAccount.findMany({
    include: { connectedByUser: { select: { displayName: true, email: true, active: true } } },
    orderBy: { connectedAt: "desc" },
  });
  const eventsByUser = new Map<string, string[]>();
  for (const e of events) {
    if (!e.driveConfiguredByUserId) continue;
    eventsByUser.set(e.driveConfiguredByUserId, [...(eventsByUser.get(e.driveConfiguredByUserId) ?? []), e.name]);
  }

  return NextResponse.json({
    events: rows,
    googleAccounts: accounts.map((a) => ({
      userName: a.connectedByUser.displayName,
      userEmail: a.connectedByUser.email,
      userActive: a.connectedByUser.active,
      googleEmail: a.email,
      connectedAt: a.connectedAt,
      valid: !a.tokenInvalidAt,
      events: eventsByUser.get(a.connectedByUserId) ?? [],
    })),
  });
}
