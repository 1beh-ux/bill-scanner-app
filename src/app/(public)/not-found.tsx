import { prisma } from "@/lib/prisma";

// 404 inside /r, /p (unknown slug or token, wrong host) -- no app name, no link into the admin app.
export default async function PublicNotFound() {
  const rows = await prisma.translation.findMany({ where: { key: { startsWith: "publicNotFound." } }, select: { key: true, cs: true } });
  const s = Object.fromEntries(rows.map((r) => [r.key, r.cs]));
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="max-w-md text-center">
        <h1 className="mb-2 text-[20px] font-semibold text-ink">{s["publicNotFound.title"] ?? "Stránka nenalezena"}</h1>
        <p className="text-[14px] text-ink-secondary">{s["publicNotFound.text"] ?? ""}</p>
      </div>
    </main>
  );
}
