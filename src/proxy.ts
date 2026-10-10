import { NextRequest, NextResponse } from "next/server";
import { isAdminHost, publicHostAllows, requestHost } from "@/lib/host-rules";

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Old run.app host -> custom domain (docs/custom-domain.md), only when
  // CANONICAL_HOST is set. Cloud Tasks (/api/tasks), Cloud Scheduler
  // (/api/cron) and Firebase's auth helper (/__/) keep working on run.app;
  // only GET/HEAD, so no form POST loses its body.
  // www.<canonical> -> <canonical> too: one admin host (Google sign-in runs on it, src/lib/firebase.ts).
  const canonical = process.env.CANONICAL_HOST;
  const host = requestHost(req.headers);
  if (
    canonical &&
    (host.endsWith(".run.app") || host === `www.${canonical}`) &&
    (req.method === "GET" || req.method === "HEAD") &&
    !pathname.startsWith("/api/tasks") &&
    !pathname.startsWith("/api/cron") &&
    !pathname.startsWith("/__/")
  ) {
    return NextResponse.redirect(`https://${canonical}${pathname}${search}`, 308);
  }

  // Any other hostname is a public host (prihlasky.…, rodice.…): only the
  // registration page, the portal and their APIs; never /login. Which host may
  // serve which event / the portal is checked in those routes (src/lib/public-host.ts).
  if (!isAdminHost(host)) {
    if (!publicHostAllows(pathname)) return new NextResponse("Not found", { status: 404 });
    if (pathname === "/") return NextResponse.rewrite(new URL("/public-landing", req.url));
    return NextResponse.next();
  }

  const session = req.cookies.get("session");

  // /__/auth/* is Firebase's sign-in helper, proxied onto our own domain
  // (next.config.ts rewrites) -- it runs before any session exists.
  // /p/<token> is the parent portal (docs/registration-portal-spec.md G): no
  // login, its own token + birth-date cookie check on every portal API request
  // (src/lib/portal-server.ts).
  // /r/<slug> is the public registration page (docs/registration-slice3-spec.md
  // D): no login, its API validates + rate-limits every submit itself.
  const isPublicPage = pathname.startsWith("/login") || pathname.startsWith("/__/") || pathname.startsWith("/p/") || pathname.startsWith("/r/");
  const isPublicApi =
    pathname.startsWith("/api/session") ||
    pathname.startsWith("/api/portal/") ||
    pathname.startsWith("/api/public/") ||
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
