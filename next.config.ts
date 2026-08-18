import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "3000-cs-491475825105-default.cs-europe-west4-bhnf.cloudshell.dev",
  ],
  experimental: {
    proxyClientMaxBodySize: "200mb",
  },
  serverExternalPackages: ["@google-cloud/tasks", "google-gax", "@grpc/grpc-js"],
};

export default nextConfig;
