// Fields Manager phase 6 (design §11): one document type's Google Doc template in the editor.
//   GET  ?event=&docType=                                  -> placeholders (classified), typed text, pending edits
//   POST {event, docType, action: "queue", edit, reason}   -> a pending edit (nothing touches the Doc yet)
//   POST {event, docType, action: "discard", editId}
//   POST {event, docType, action: "save", copy?}           -> all pending edits in one guarded batchUpdate
import { NextRequest, NextResponse } from "next/server";
import { DriveError } from "@/lib/drive-errors";
import { analyzeTemplate, discardEdit, queueEdit, saveEdits } from "@/lib/doc-editor";
import { readEdit } from "@/lib/doc-edits";
import { fieldsManagerAccess, pickEvent } from "../access";

const driveFailure = (err: unknown) => {
  if (err instanceof DriveError) return NextResponse.json({ error: err.code, ...err.params }, { status: 502 });
  console.error("[fields/doc]", err);
  return NextResponse.json({ error: "drive_unknown" }, { status: 502 });
};

async function scope(eventParam: unknown) {
  const a = await fieldsManagerAccess();
  if ("error" in a) return a;
  const { selected } = await pickEvent(a.organizationId, typeof eventParam === "string" ? eventParam : null);
  if (!selected || selected.id !== eventParam) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  return { ...a, eventId: selected.id };
}

export async function GET(req: NextRequest) {
  const s = await scope(req.nextUrl.searchParams.get("event"));
  if ("error" in s) return s.error;
  try {
    const r = await analyzeTemplate(s.eventId, s.organizationId, req.nextUrl.searchParams.get("docType") ?? "");
    return r ? NextResponse.json(r) : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (err) {
    return driveFailure(err);
  }
}

export async function POST(req: NextRequest) {
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const s = await scope(b.event);
  if ("error" in s) return s.error;
  const docTypeId = typeof b.docType === "string" ? b.docType : "";
  if (b.action === "queue") {
    const edit = readEdit(b.edit);
    if (!edit) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const reason = typeof b.reason === "string" ? b.reason.slice(0, 40) : edit.type;
    const r = await queueEdit(s.eventId, s.organizationId, docTypeId, s.userId, edit, reason);
    return r ? NextResponse.json({ id: r.id }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (b.action === "discard" && typeof b.editId === "string") {
    await discardEdit(s.organizationId, b.editId);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "save") {
    try {
      const r = await saveEdits(s.eventId, s.organizationId, docTypeId, { copy: b.copy === true });
      return "error" in r ? NextResponse.json(r, { status: r.error === "not_found" ? 404 : 409 }) : NextResponse.json(r);
    } catch (err) {
      return driveFailure(err);
    }
  }
  return NextResponse.json({ error: "invalid" }, { status: 400 });
}
