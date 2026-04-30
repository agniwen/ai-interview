import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

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
  reactCompiler: true,
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse"],
  transpilePackages: ["@repo/adapter-feishu"],
};

export default withWorkflow(nextConfig);
