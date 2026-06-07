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
  // 中文：monorepo 下 standalone 需要知道仓库根，否则会把 trace 局限在 app 目录里。
  // English: in a monorepo, standalone needs the repo root so workspace deps are traced.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  reactCompiler: true,
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse"],
  transpilePackages: [
    "@arc/adapter-feishu",
    "@arc/ai-recruitment-copilot-backend",
    "@arc/db-schema",
    "@arc/shared",
  ],
};

export default nextConfig;
