import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
  // Firebase Auth's sign-in helper served from our own domain. Safari/iOS block
  // the cross-site storage the default <project>.firebaseapp.com helper needs,
  // so Google sign-in never completed there (src/lib/firebase.ts picks the
  // same-origin auth domain for those browsers).
  async rewrites() {
    const firebaseHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`;
    return [
      { source: "/__/auth/:path*", destination: `https://${firebaseHost}/__/auth/:path*` },
      { source: "/__/firebase/:path*", destination: `https://${firebaseHost}/__/firebase/:path*` },
    ];
  },
};

export default nextConfig;
