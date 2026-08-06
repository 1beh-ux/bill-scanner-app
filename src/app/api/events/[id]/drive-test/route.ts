import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getDriveClient } from "@/lib/drive";

type FolderCheckResult = {
  folderId: string;
  accessible: boolean;
  name?: string;
  errorCode?: "wrong_type" | "not_found" | "access_denied" | "unknown";
};

async function checkFolder(
  drive: Awaited<ReturnType<typeof getDriveClient>>,
  folderId: string
): Promise<FolderCheckResult> {
  try {
    const res = await drive.files.get({
      fileId: folderId,
      fields: "id, name, mimeType",
      supportsAllDrives: true,
    });
    if (res.data.mimeType !== "application/vnd.google-apps.folder") {
      return { folderId, accessible: false, errorCode: "wrong_type" };
    }
    return { folderId, accessible: true, name: res.data.name ?? undefined };
  } catch (err: any) {
    const status = err?.code || err?.response?.status;
    if (status === 404) {
      return { folderId, accessible: false, errorCode: "not_found" };
    }
    if (status === 403) {
      return { folderId, accessible: false, errorCode: "access_denied" };
    }
    return { folderId, accessible: false, errorCode: "unknown" };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  let ingestFolderId: string | null = body.ingestFolderId ?? null;
  let exportFolderId: string | null = body.exportFolderId ?? null;

  if (ingestFolderId === null && exportFolderId === null) {
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    ingestFolderId = event.driveIngestFolderId;
    exportFolderId = event.driveExportFolderId;
  }

  const drive = await getDriveClient();
  const results: { ingest?: FolderCheckResult; export?: FolderCheckResult } = {};

  if (ingestFolderId) results.ingest = await checkFolder(drive, ingestFolderId);
  if (exportFolderId) results.export = await checkFolder(drive, exportFolderId);

  return NextResponse.json(results);
}