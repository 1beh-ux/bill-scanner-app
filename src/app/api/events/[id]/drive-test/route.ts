import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { getDriveIdentity, testFolder } from "@/lib/drive";
import { DriveError, parseFolderId, type DriveErrorCode, type DriveErrorParams } from "@/lib/drive-errors";

type Label = "ingest" | "export" | "participants";
type Item =
  | { ok: true; folderId: string; name: string; inSharedDrive: boolean }
  | { ok: false; folderId: string | null; error: DriveErrorCode; params: DriveErrorParams };

// "Otestovat připojení": checks each configured folder separately with the
// identity the event actually uses -- ingest needs read access, export and
// participants need write access. Nothing is created or changed in Drive.
// Body (optional): the folder fields as currently typed (ids or pasted URLs),
// to test before saving; otherwise the saved ones are used.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const denied = await requireModuleAccess(user, id, "bills");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "event_not_found" }, { status: 404 });

  const raw: Record<Label, string | null> = {
    ingest: typeof body.ingestFolderId === "string" ? body.ingestFolderId : (body.ingestFolderId === undefined ? event.driveIngestFolderId : null),
    export: typeof body.exportFolderId === "string" ? body.exportFolderId : (body.exportFolderId === undefined ? event.driveExportFolderId : null),
    participants:
      typeof body.participantsFolderId === "string" ? body.participantsFolderId : (body.participantsFolderId === undefined ? event.driveParticipantsFolderId : null),
  };

  const identity = await getDriveIdentity(id);
  const baseParams: DriveErrorParams = { identity: identity.email, identityKind: identity.kind, serviceAccount: identity.serviceAccountEmail };
  const need: Record<Label, "read" | "write"> = { ingest: "read", export: "write", participants: "write" };

  const results: Partial<Record<Label, Item>> = {};
  const ids: Partial<Record<Label, string>> = {};
  for (const label of ["ingest", "export", "participants"] as Label[]) {
    const input = raw[label];
    if (!input || !input.trim()) continue;
    const folderId = parseFolderId(input);
    if (!folderId) {
      results[label] = { ok: false, folderId: null, error: "not_a_folder_id", params: { ...baseParams, folderLabel: label } };
      continue;
    }
    ids[label] = folderId;
    const t = await testFolder(id, folderId, need[label], label);
    results[label] = t.ok
      ? { ok: true, folderId, name: t.name, inSharedDrive: t.inSharedDrive }
      : { ok: false, folderId, error: (t.error as DriveError).code, params: (t.error as DriveError).params };
  }

  const warnings: string[] = [];
  if (ids.ingest && ids.export && ids.ingest === ids.export) warnings.push("same_folder");
  if (identity.warning === "no_connection") warnings.push("no_connection_fallback");
  if (identity.warning === "token_invalid") warnings.push("token_invalid_fallback");
  if (identity.warning === "user_inactive") warnings.push("user_inactive_fallback");

  return NextResponse.json({
    identity: {
      kind: identity.kind,
      email: identity.email,
      serviceAccountEmail: identity.serviceAccountEmail,
      warning: identity.warning ?? null,
      configuredBy: identity.configuredBy ?? null,
    },
    results,
    warnings,
  });
}
