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
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse"],
  transpilePackages: ["@repo/adapter-feishu"],
};

export default nextConfig;
