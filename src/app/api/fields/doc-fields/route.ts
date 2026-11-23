// Round 2 (2026-11-23): a field switched off / on for ONE document template -- printed empty in that template only
// (EventListItem.data.disabledFields, applied where documents are generated). Default: on everywhere.
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import type { DocumentTypeData } from "@/lib/mail-reply-template";
import { fieldsManagerAccess, pickEvent } from "../access";

export async function PATCH(req: NextRequest) {
  const a = await fieldsManagerAccess();
  if ("error" in a) return a.error;
  const b = ((await req.json().catch(() => null)) ?? {}) as { event?: unknown; docType?: unknown; key?: unknown; on?: unknown };
  const { selected } = await pickEvent(a.organizationId, typeof b.event === "string" ? b.event : null);
  if (!selected || selected.id !== b.event || typeof b.docType !== "string" || typeof b.key !== "string" || typeof b.on !== "boolean") return NextResponse.json({ error: "invalid" }, { status: 400 });
  const dt = await prisma.eventListItem.findFirst({ where: { id: b.docType, eventId: selected.id, kind: "document" } });
  if (!dt) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const data = (dt.data as DocumentTypeData | null) ?? {};
  const off = new Set(data.disabledFields ?? []);
  if (b.on) off.delete(b.key);
  else off.add(b.key);
  await prisma.$transaction([
    prisma.eventListItem.update({ where: { id: dt.id }, data: { data: { ...data, disabledFields: [...off] } as Prisma.InputJsonValue } }),
    prisma.fieldChangeLog.create({ data: { organizationId: a.organizationId, action: "doc_field", byId: a.userId, before: { docTypeId: dt.id, key: b.key, on: !b.on }, after: { docTypeId: dt.id, key: b.key, on: b.on } } }),
  ]);
  return NextResponse.json({ ok: true });
}
