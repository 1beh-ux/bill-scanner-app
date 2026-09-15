import { NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = req.cookies.get("session");

  const isPublicPage = pathname.startsWith("/login");
  const isPublicApi =
    pathname.startsWith("/api/session") ||
    pathname.startsWith("/api/cron") ||
    // Cloud Tasks-driven bill AI processing (src/lib/cloud-tasks.ts) --
    // server-to-server, authenticated by its own x-tasks-secret header
    // check (src/app/api/tasks/process-bill-ai/[id]/route.ts), never by a
    // session cookie. Same shape as /api/cron above; this prefix was
    // missed when that queue was introduced, which silently 401'd every
    // single task dispatch and left bills stuck "queued" forever.
    pathname.startsWith("/api/tasks");

  if (session || isPublicPage || isPublicApi) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
