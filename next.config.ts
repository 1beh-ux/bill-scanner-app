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
};

export default nextConfig;
