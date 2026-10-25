import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isOrgAdmin } from "@/lib/org-scope";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { addEmailFile, filesOf, removeEmailFile, EMAIL_FILE_MAX_BYTES } from "@/lib/email-files";

// Files an e-mail carries (src/lib/email-files.ts). ?purposeKey=…[&eventId=…]: without eventId the
// organization's (admins), with it the event's (whoever edits its e-mails); GET also lists the organization's.
async function scope(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const q = req.nextUrl.searchParams;
  const purposeKey = q.get("purposeKey") ?? "";
  const eventId = q.get("eventId") || null;
  if (!/^[a-z0-9_]{1,64}$/.test(purposeKey)) return { error: NextResponse.json({ error: "bad_request" }, { status: 400 }) };
  if (eventId) {
    const denied = await requireAnyModuleAccess(user, eventId, ["participants", "health", "mail", "tickets"]);
    if (denied) return { error: denied };
  } else if (!isOrgAdmin(user)) return { error: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  return { organizationId: user.organizationId, eventId, purposeKey };
}

export async function GET(req: NextRequest) {
  const s = await scope(req);
  if ("error" in s) return s.error;
  const [own, org] = await Promise.all([filesOf(s.organizationId, s.eventId), s.eventId ? filesOf(s.organizationId, null) : null]);
  return NextResponse.json({ files: own[s.purposeKey] ?? [], orgFiles: org?.[s.purposeKey] ?? [] });
}

/** multipart: file */
export async function POST(req: NextRequest) {
  const s = await scope(req);
  if ("error" in s) return s.error;
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (file.size > EMAIL_FILE_MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const files = await addEmailFile({ ...s, name: file.name, type: file.type, buffer: Buffer.from(await file.arrayBuffer()) });
  if (files === "too_many") return NextResponse.json({ error: "too_many" }, { status: 400 });
  return NextResponse.json({ files });
}

/** ?id=… */
export async function DELETE(req: NextRequest) {
  const s = await scope(req);
  if ("error" in s) return s.error;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  return NextResponse.json({ files: await removeEmailFile({ ...s, id }) });
}
