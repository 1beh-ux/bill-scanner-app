import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { linkedAccount, requireBank } from "@/lib/bank/guard";
import { decodeText, mappingProblems, toRows, cleanMapping } from "@/lib/bank/parse";
import { commitImport, evaluate, parseTable, readTable } from "@/lib/bank/import";
import { windowOf } from "@/lib/bank/sync";
import { extractSpreadsheetId, readSheetTable } from "@/lib/sheet-import";
import { toDriveError } from "@/lib/drive";
import { httpStatusForDriveError } from "@/lib/drive-errors";

export const maxDuration = 120;
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Banka import (file / paste / Google Sheet). Without commit: preview -- header row, headers, mapping,
 * counts (Nové / Duplicita / Mimo období / Chyba) and the first rows. With commit: the same source is
 * parsed again and imported; the mapping is remembered on the account.
 * Body: { accountId, source: "file" | "paste" | "sheet", base64?, text?, fileName?, spreadsheetId?, tab?, mapping?, headerRow?, commit? }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireBank(id);
  if ("error" in ctx) return ctx.error;
  const body = await req.json().catch(() => ({}));
  const link = await linkedAccount(id, body.accountId);
  if (link instanceof NextResponse) return link;
  const account = link.bankAccount;

  let rows: string[][];
  let sheet: { spreadsheetId: string; tab: string; tabs: string[] } | null = null;
  if (body.source === "sheet") {
    const spreadsheetId = extractSpreadsheetId(typeof body.spreadsheetId === "string" ? body.spreadsheetId : account.sheetId ?? "");
    if (!spreadsheetId) return NextResponse.json({ error: "spreadsheet_id_required" }, { status: 400 });
    try {
      const t = await readSheetTable(id, spreadsheetId, body.tab ?? account.sheetRange ?? undefined);
      rows = [t.headers, ...t.rows];
      sheet = { spreadsheetId, tab: t.tab, tabs: t.tabs };
    } catch (err) {
      const e = await toDriveError(id, err, { purpose: "read" });
      return NextResponse.json({ error: e.code, ...e.params }, { status: httpStatusForDriveError(e.code) });
    }
  } else if (body.source === "file" && typeof body.base64 === "string") {
    const bytes = Buffer.from(body.base64, "base64");
    if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
    rows = toRows(decodeText(bytes));
  } else if (body.source === "paste" && typeof body.text === "string") {
    rows = toRows(body.text.slice(0, MAX_BYTES));
  } else return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (!rows.length) return NextResponse.json({ error: "empty" }, { status: 400 });

  const t = readTable(rows, Array.isArray(body.mapping) ? body.mapping : account.columnMapping, typeof body.headerRow === "number" ? body.headerRow : undefined);
  if (Array.isArray(body.mapping)) t.mapping = cleanMapping(body.mapping, t.headers.length);
  const problems = mappingProblems(t.mapping);
  const window = windowOf(link);
  const head = { headerRow: t.headerRow, headers: t.headers, mapping: t.mapping, problems, window, sheet, top: rows.slice(0, 8) };
  if (problems.length) return NextResponse.json({ ...head, counts: null, rows: [] });

  const results = parseTable(t, account);
  if (!body.commit) {
    const ev = await evaluate(account.id, results, window);
    return NextResponse.json({ ...head, counts: ev.counts, rows: ev.rows.slice(0, 20), errors: ev.rows.filter((r) => r.status === "error").slice(0, 50) });
  }
  if (ctx.event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  await prisma.bankAccount.update({
    where: { id: account.id },
    data: { columnMapping: t.mapping, ...(sheet && { sheetId: sheet.spreadsheetId, sheetRange: sheet.tab, ...(account.sourceType === "file" && { sourceType: "sheet" as const }) }) },
  });
  const res = await commitImport({
    eventId: id,
    account,
    source: body.source === "sheet" ? "sheet" : body.source === "paste" ? "paste" : "csv",
    fileName: typeof body.fileName === "string" ? body.fileName.slice(0, 200) : null,
    userId: ctx.user.id,
    results,
    window,
    markMissing: body.source === "sheet",
  });
  return NextResponse.json(res);
}
