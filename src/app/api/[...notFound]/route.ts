import { NextResponse } from "next/server";

// Any /api path no route matches: JSON, not the HTML 404 page (audit 2026-11-05).
const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });
export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
