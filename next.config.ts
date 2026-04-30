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
  // 双管齐下让 standalone 包含 @workflow/world-postgres 整棵依赖树:
  //
  // 1) serverExternalPackages 把它从 turbopack 的数字 id bundle 中拎出来, 输出
  //    `require("@workflow/world-postgres")` 字符串, NFT 可识别。
  // 2) outputFileTracingIncludes 兜底: NFT trace 出来后, standalone copy 阶段对
  //    instrumentation.js 的 trace 处理不稳定, 显式 include `.pnpm` 仓库里的实际
  //    包路径 (pnpm 把真实文件放在 .pnpm/, 顶层 node_modules 只有 symlink)。
  //
  // 没这两个, 容器启动会 MODULE_NOT_FOUND 把整个 instrumentation 炸掉, 间接让
  // 所有路由(含 better-auth) 500。
  //
  // 1) external = preserve `require("@workflow/world-postgres")` string for NFT.
  // 2) outputFileTracingIncludes = belt-and-suspenders force-copy because the
  //    standalone copy phase doesn't reliably honor instrumentation's NFT trace.
  //    Globs target the .pnpm store (where pnpm places real files; top-level
  //    node_modules holds only symlinks).
  // outputFileTracingIncludes: {
  //   "/**/*": [
  //     "./node_modules/.pnpm/@workflow+world-postgres@*/**/*",
  //     "./node_modules/.pnpm/@workflow+world@*/**/*",
  //     "./node_modules/.pnpm/@workflow+errors@*/**/*",
  //     "./node_modules/.pnpm/graphile-worker@*/**/*",
  //     "./node_modules/.pnpm/cbor-x@*/**/*",
  //     "./node_modules/.pnpm/ulid@*/**/*",
  //     "./node_modules/.pnpm/@vercel+queue@*/**/*",
  //   ],
  // },
  reactCompiler: true,
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse", "@workflow/world-postgres"],
  transpilePackages: ["@repo/adapter-feishu"],
};

export default withWorkflow(nextConfig);
