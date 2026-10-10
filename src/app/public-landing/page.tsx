import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

// "/" on a public host (src/proxy.ts rewrites it here): a neutral page with no
// data. "Ověřit" in Organizace -> Připojení looks for data-public-landing.
export const metadata: Metadata = { title: { absolute: "Přihlášky a rodičovský portál" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PublicLandingPage() {
  const rows = await prisma.translation.findMany({ where: { key: { startsWith: "publicLanding." } }, select: { key: true, cs: true } });
  const s = Object.fromEntries(rows.map((r) => [r.key, r.cs]));
  return (
    <main data-public-landing className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="max-w-md text-center">
        <h1 className="mb-2 text-[20px] font-semibold text-ink">{s["publicLanding.title"] ?? "Přihlášky a rodičovský portál"}</h1>
        <p className="text-[14px] text-ink-secondary">{s["publicLanding.text"] ?? ""}</p>
      </div>
    </main>
  );
}
