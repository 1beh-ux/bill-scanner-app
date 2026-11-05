import type { NextConfig } from "next";

// Security headers (audit 2026-11-05). Framing (X-Frame-Options / frame-ancestors, per public host for the
// embed feature) stays in src/proxy.ts (src/lib/host-rules.ts framingHeaders) -- not here.
// For two entries setting the same key on a path, the later one wins: the per-path overrides come last.
const NO_DEVICES = "camera=(), microphone=(), geolocation=()";
// Report-only first (docs/csp-report-only.md): what an enforcing policy would block is reported to
// /api/csp-report. 'unsafe-inline' scripts: Next's inline bootstrap without per-request nonces.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://apis.google.com",
  "frame-src 'self' https://accounts.google.com https://apis.google.com https://*.firebaseapp.com blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "report-uri /api/csp-report",
].join("; ");
// Pages carrying a secret token in the URL: no referrer, not indexed, never cached.
const TOKEN_PAGE = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "no-store" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // No image optimizer: the app doesn't use next/image, and /_next/image is outside the login proxy.
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: NO_DEVICES },
        ],
      },
      { source: "/((?!api/|_next/).*)", headers: [{ key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY }] },
      // Ticket scanning reads the camera (src/components/tickets/TicketScanner.tsx).
      { source: "/events/:id/tickets/scan", headers: [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" }] },
      { source: "/vstup/:token*", headers: [...TOKEN_PAGE, { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" }] },
      { source: "/p/:path*", headers: TOKEN_PAGE },
      { source: "/u/:path*", headers: TOKEN_PAGE },
      { source: "/vyuctovani/:path*", headers: TOKEN_PAGE },
      { source: "/api/portal/:path*", headers: TOKEN_PAGE },
      { source: "/api/public/:path*", headers: TOKEN_PAGE },
    ];
  },
  allowedDevOrigins: [
    "3000-cs-491475825105-default.cs-europe-west4-bhnf.cloudshell.dev",
    "3000-cs-491475825105-default.cs-europe-west4-pear.cloudshell.dev",
  ],
  experimental: {
    proxyClientMaxBodySize: "200mb",
  },
  // pdfjs-dist is loaded at runtime by src/lib/pdf-blank.ts (blank-page detection); it must not be bundled.
  // pdfjs loads its worker with a dynamic import that file tracing cannot see, so the standalone
  // build would ship without it and blank-page detection would silently fall back to "keep all".
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
  serverExternalPackages: ["@google-cloud/tasks", "google-gax", "@grpc/grpc-js", "pdfjs-dist"],
  // Firebase Auth's sign-in helper served from our own domain (src/lib/firebase.ts
  // uses it as authDomain). Always the project's firebaseapp.com -- never
  // NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: set to our own host, it would proxy to itself.
  async rewrites() {
    const firebaseHost = `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`;
    return [
      { source: "/__/auth/:path*", destination: `https://${firebaseHost}/__/auth/:path*` },
      { source: "/__/firebase/:path*", destination: `https://${firebaseHost}/__/firebase/:path*` },
    ];
  },
};

export default nextConfig;
