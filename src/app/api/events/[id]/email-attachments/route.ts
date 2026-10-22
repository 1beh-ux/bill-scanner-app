import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { readEmailAttachments, takesAttachments } from "@/lib/email-attachments";
import type { DocumentTypeData } from "@/lib/mail-reply-template";

// Nastavení akce -> Pošta: which of the event's documents each participant e-mail carries
// (src/lib/email-attachments.ts). The documents with a Google Doc: fixed (same for everyone) or generated.
async function view(eventId: string) {
  const [event, docs] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { emailAttachments: true } }),
    prisma.eventListItem.findMany({ where: { eventId, kind: "document", active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  return {
    attachments: readEmailAttachments(event.emailAttachments),
    documents: docs
      .filter((d) => (d.data as DocumentTypeData | null)?.templateGoogleDocId)
      .map((d) => ({ id: d.id, name: d.name, fixed: !!(d.data as DocumentTypeData | null)?.staticAttachment, autoAttachOnAccept: !!(d.data as DocumentTypeData | null)?.autoAttachOnAccept })),
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const denied = await requireAnyModuleAccess(user, id, ["participants", "health", "mail"]);
  if (denied) return denied;
  return NextResponse.json(await view(id));
}

/** { purposeKey, ids }: that e-mail's documents (only the event's own document types). */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const denied = await requireAnyModuleAccess(user, id, ["participants", "health", "mail"]);
  if (denied) return denied;
  const { purposeKey, ids } = (await req.json().catch(() => ({}))) as { purposeKey?: unknown; ids?: unknown };
  if (typeof purposeKey !== "string" || !takesAttachments(purposeKey) || !Array.isArray(ids)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const own = new Set((await view(id)).documents.map((d) => d.id));
  const current = readEmailAttachments((await prisma.event.findUniqueOrThrow({ where: { id }, select: { emailAttachments: true } })).emailAttachments);
  const next = readEmailAttachments({ ...current, [purposeKey]: ids.filter((x) => typeof x === "string" && own.has(x)) });
  await prisma.event.update({ where: { id }, data: { emailAttachments: Object.keys(next).length ? next : Prisma.DbNull } });
  return NextResponse.json(await view(id));
}
