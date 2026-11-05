import { NextRequest, NextResponse } from "next/server";

// Content-Security-Policy-Report-Only violations (next.config.ts, docs/csp-report-only.md). Public (browsers
// post here without a session); logs one short line per report -- the page path only, never its query
// (tokens). Small bodies only.
export async function POST(req: NextRequest) {
  const text = (await req.text().catch(() => "")).slice(0, 8000);
  try {
    const j = JSON.parse(text);
    const reports = Array.isArray(j) ? j.map((r) => r.body ?? r) : [j["csp-report"] ?? j];
    for (const r of reports.slice(0, 10)) {
      const path = (u: unknown) => (typeof u === "string" ? u.split(/[?#]/)[0].slice(0, 200) : "");
      console.warn("[csp-report]", JSON.stringify({ page: path(r["document-uri"] ?? r.documentURL), directive: r["violated-directive"] ?? r.effectiveDirective, blocked: path(r["blocked-uri"] ?? r.blockedURL) }));
    }
  } catch {
    // not a CSP report: ignore
  }
  return new NextResponse(null, { status: 204 });
}
