import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import SettlementApp from "./SettlementApp";

// A person's Vyúčtování (src/lib/settlement-links.ts): no login -- the token is the address; the event's name in
// the path is only for people to recognise it. Texts from the translations table (settlementPage.*), server-side.
export const metadata = { title: { absolute: "Vyúčtování" }, robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function SettlementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = token.length >= 20 && token.length <= 64 ? await prisma.settlementLink.findUnique({ where: { token }, select: { id: true } }) : null;
  if (!link) notFound();
  const rows = await prisma.translation.findMany({ where: { key: { startsWith: "settlementPage." } }, select: { key: true, cs: true } });
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SettlementApp token={token} strings={Object.fromEntries(rows.map((r) => [r.key, r.cs]))} />
    </div>
  );
}
