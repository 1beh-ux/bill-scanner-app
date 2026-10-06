import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { readUploadedFile } from "@/lib/participant-document-store";
import { savePersonDocument } from "@/lib/person-documents";
import { currentPersonDoc } from "@/lib/registration-status";

// The person's permanent documents (docs/registration-slice6-spec.md 3, 5), admin only.
// GET: per "platí trvale" document type (plus any key the person still has
// documents of) the current one and the history.
// POST multipart (key, file): upload straight to the person store -- same
// limits as the portal upload; becomes the current document of that type.
async function admin() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (user.role !== "admin") return { error: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  return { user };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await admin();
  if (error) return error;
  const { id } = await params;
  const [templates, docs] = await Promise.all([
    prisma.listTemplate.findMany({ where: { kind: "document", key: { not: null } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.personDocument.findMany({ where: { childId: id }, orderBy: { createdAt: "desc" }, include: { sourceEvent: { select: { name: true } } } }),
  ]);
  const permanent = templates.filter((t) => (t.data as { permanent?: boolean } | null)?.permanent);
  const keys = [...new Set([...permanent.map((t) => t.key!), ...docs.map((d) => d.docKey)])];
  return NextResponse.json(
    keys.map((key) => {
      const current = currentPersonDoc(docs, key);
      return {
        key,
        name: templates.find((t) => t.key === key)?.name ?? key,
        // Unticked "platí trvale": the rows stay, but no event counts them.
        permanent: permanent.some((t) => t.key === key),
        docs: docs
          .filter((d) => d.docKey === key)
          .map((d) => ({ id: d.id, filename: d.originalFilename, createdAt: d.createdAt, revokedAt: d.revokedAt, sourceEvent: d.sourceEvent?.name ?? null, current: d.id === current?.id })),
      };
    })
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await admin();
  if (error) return error;
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  const key = String(form?.get("key") ?? "");
  const [child, template] = await Promise.all([
    prisma.child.findUnique({ where: { id }, select: { id: true } }),
    key ? prisma.listTemplate.findFirst({ where: { kind: "document", key } }) : null,
  ]);
  if (!child || !(template?.data as { permanent?: boolean } | null)?.permanent) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const upload = await readUploadedFile(form?.get("file"));
  if (!upload) return NextResponse.json({ error: "bad_file" }, { status: 400 });
  const doc = await savePersonDocument({ childId: id, docKey: key, buffer: upload.buffer, contentType: upload.contentType, filename: upload.filename, userId: user.id });
  return NextResponse.json(doc, { status: 201 });
}
