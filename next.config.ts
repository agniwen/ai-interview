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
  output: "standalone",
  // `@workflow/world-postgres` 是 workflow runtime 根据 WORKFLOW_TARGET_WORLD 环境变量
  // 在运行时动态 require 的, Next.js NFT (next-file-tracing) 只能追静态 import,
  // standalone 构建会漏掉这个 npm 包 → 容器启动报 MODULE_NOT_FOUND, 间接让所有
  // 路由 500。这里强制 trace 把它打进 `.next/standalone/node_modules`。
  // `@workflow/world-postgres` is dynamically required by workflow runtime
  // based on WORKFLOW_TARGET_WORLD; NFT only traces static imports, so the
  // standalone build skips this package and the container fails to boot with
  // MODULE_NOT_FOUND, cascading into 500s on every route. Force-include it.
  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/@workflow/world-postgres/**/*",
      "./node_modules/@workflow/world/**/*",
    ],
  },
  reactCompiler: true,
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse"],
  transpilePackages: ["@repo/adapter-feishu"],
};

export default withWorkflow(nextConfig);
