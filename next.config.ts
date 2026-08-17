import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "3000-cs-491475825105-default.cs-europe-west4-pear.cloudshell.dev",
  ],
  experimental: {
    proxyClientMaxBodySize: "200mb",
  },
  // @google-cloud/tasks pulls in google-gax (gRPC), which does dynamic
  // require()s to load protobuf definitions at runtime — Turbopack's
  // static build-time analysis can't follow those and fails with
  // "Cannot find module as expression is too dynamic". Listing these here
  // tells Next.js to leave them as plain runtime requires instead of
  // trying to bundle/analyze them, same as any other Node dependency.
  serverExternalPackages: ["@google-cloud/tasks", "google-gax", "@grpc/grpc-js"],
};

export default nextConfig;
