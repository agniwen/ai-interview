import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        hostname: "ouch-prod-var-cdn.icons8.com",
        protocol: "https",
      },
    ],
  },
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  reactCompiler: true,
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse"],
  transpilePackages: ["@repo/adapter-feishu"],
};

export default nextConfig;
