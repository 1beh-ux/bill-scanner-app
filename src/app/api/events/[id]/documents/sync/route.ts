import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { loadSyncs, runSavedSync } from "@/lib/participant-sync-run";
import { participantsRootFolderId, syncParticipantDocumentsToDrive } from "@/lib/mail-drive-sync";
import { syncStatusSheetExport } from "@/lib/mail-sheets-sync";
import { documentDisplayName } from "@/lib/mail-reply-template";

// Účastníci -> Dokumenty: every connection that updates documents, on one page.
// GET = what's connected (sheet connections and the documents they tick, Drive
// copies, status sheet) with the last sync; POST "Synchronizovat dokumenty" = run them all.
type Ctx = { params: Promise<{ id: string }> };

async function guard(ctx: Ctx): Promise<{ denied: NextResponse } | { eventId: string }> {
  const user = await getCurrentUser();
  if (!user) return { denied: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) } as const;
  const { id: eventId } = await ctx.params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  return denied ? ({ denied } as const) : ({ eventId } as const);
}

async function overview(eventId: string) {
  const [event, syncs, docTypes] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId } }),
    loadSyncs(eventId),
    prisma.eventListItem.findMany({ where: { eventId, kind: "document" }, select: { id: true, name: true, key: true, data: true } }),
  ]);
  const docName = (id?: string) => {
    const d = docTypes.find((x) => x.id === id);
    return d ? documentDisplayName(d as Parameters<typeof documentDisplayName>[0]) : null;
  };
  return {
    sheets: syncs.map((s) => ({
      id: s.id,
      name: s.name,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${s.sheetId}`,
      document: docName(s.markDocumentId),
      autoSync: s.autoSync,
      lastAt: s.lastSync?.at ?? null,
      lastError: s.lastSync?.error?.code ?? null,
    })),
    drive: { configured: !!participantsRootFolderId(event), enabled: event.driveDocSyncEnabled },
    statusSheet: {
      configured: !!event.driveExportFolderId,
      enabled: event.statusExportEnabled,
      url: event.statusExportSheetId ? `https://docs.google.com/spreadsheets/d/${event.statusExportSheetId}` : null,
      lastAt: event.statusExportLastSyncedAt,
    },
  };
}

export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(ctx);
  if ("denied" in g) return g.denied;
  return NextResponse.json(await overview(g.eventId));
}

export async function POST(_req: Request, ctx: Ctx) {
  const g = await guard(ctx);
  if ("denied" in g) return g.denied;
  const { eventId } = g;
  const results: { what: string; ok: boolean; detail?: string }[] = [];
  const step = async (what: string, fn: () => Promise<string | undefined>) => {
    try {
      results.push({ what, ok: true, detail: await fn() });
    } catch (err) {
      // A short code (DriveError / sync error), never a raw message.
      results.push({ what, ok: false, detail: (err as { code?: string }).code ?? "failed" });
    }
  };
  for (const s of await loadSyncs(eventId)) {
    await step(`sheet:${s.name}`, async () => {
      const r = await runSavedSync(eventId, s.id, false);
      const code = "error" in r ? (typeof r.error === "string" ? r.error : r.error?.code) : undefined;
      if (code) throw Object.assign(new Error(code), { code });
      return undefined;
    });
  }
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  if (event.driveDocSyncEnabled && participantsRootFolderId(event)) {
    await step("drive", async () => String((await syncParticipantDocumentsToDrive(eventId)).synced));
  }
  if (event.statusExportEnabled && event.driveExportFolderId) await step("statusSheet", async () => void (await syncStatusSheetExport(eventId)));
  return NextResponse.json({ results, ...(await overview(eventId)) });
}
