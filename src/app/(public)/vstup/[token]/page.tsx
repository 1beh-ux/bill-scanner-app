import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { doorCounts } from "@/lib/tickets-server";
import ScanApp from "./ScanApp";

// The secret door link of a public event (docs/public-event-tickets-spec.md): check-in without a
// login, for one-off helpers. Unknown / revoked token or a closed event = 404. Texts come from the
// translations table (scan.*), server-side -- there is no session to load them with.
export const metadata = { title: { absolute: "Vstup" }, referrer: "no-referrer" };

export default async function DoorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const event = token.length >= 20 ? await prisma.event.findUnique({ where: { ticketScanToken: token }, select: { id: true, name: true, status: true } }) : null;
  if (!event || event.status !== "active") notFound();
  const [rows, counts] = await Promise.all([prisma.translation.findMany({ where: { key: { startsWith: "scan." } }, select: { key: true, cs: true } }), doorCounts(event.id)]);
  return (
    <div className="mx-auto min-h-screen max-w-lg bg-paper p-4 text-ink">
      <h1 className="mb-4 text-[20px] font-semibold">{event.name}</h1>
      <ScanApp token={token} strings={Object.fromEntries(rows.map((r) => [r.key, r.cs]))} counts={counts} />
    </div>
  );
}
