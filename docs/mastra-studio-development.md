# Mastra Studio 二次开发

Mastra Studio 作为 ARC monorepo 内的独立 Vite 应用维护。它与 TanStack Start 共用仓库和 pnpm lockfile，但保留自己的 React Router、样式和构建边界。

## 应用位置

```text
apps/mastra-studio/
├── src/                 # 可直接修改的官方 Studio SPA 源码
├── package.json         # 独立 workspace 应用
├── vite.config.ts       # ARC 子路径和 API 配置
├── UPSTREAM.md          # 上游版本与同步约定
└── UPSTREAM_LICENSE.md  # 上游许可证
```

当前源码基于 `mastra@1.18.2` 的 `packages/playground`。运行时依赖使用该版本对应的官方 npm 包，不再依赖相邻目录或第二个 Git 仓库。

## 首次安装与启动

依赖由根 workspace 统一安装：

```bash
pnpm install
```

分别启动 Studio 和 ARC Web：

```bash
pnpm mastra:studio:source
pnpm --filter @arc/ai-recruitment-copilot dev
```

访问 `/platform/mastra-studio`。ARC 开发服务器会将 `/internal/mastra-studio/*` 同域代理到 `http://localhost:5173`；可通过 `MASTRA_STUDIO_DEV_URL` 修改目标地址。Studio API 使用 `/api/platform/mastra/*`，该路由位于现有平台管理员中间件之后，并直接绑定业务运行时使用的同一个 Mastra 单例，不需要再启动第二个 4111 实例。

也可以使用根 `pnpm dev` 让 Turborepo 同时启动所有带 `dev` 脚本的应用。

## 修改与验证

Studio 页面、路由和交互直接修改 `apps/mastra-studio/src/`。单独构建：

```bash
pnpm --filter @arc/mastra-studio build
pnpm --filter @arc/mastra-studio test
```

构建产物位于 `apps/mastra-studio/dist/`，已经写入 `/internal/mastra-studio/` base path 和 `/api/platform/mastra` API prefix。

构建 ARC Web 时会先构建 Studio，再把产物复制到
`apps/ai-recruitment-copilot/.output/public/internal/mastra-studio/`。因此部署 Web
的 `.output` 即可同时提供 iframe 页面，不需要额外的 Studio 进程或反向代理：

```bash
pnpm --filter @arc/ai-recruitment-copilot build
```

上游的 215 个 Vitest 文件已接入 workspace，当前覆盖 1458 项测试（其中 2 项按上游设置跳过）。上游 Studio 的完整 TypeScript 检查依赖 Mastra 未发布的内部 workspace 源码。当前独立应用使用已发布的官方包，因此以完整单元测试和 Vite 生产构建作为该应用的验证门禁；ARC 其他应用仍执行各自的 TypeScript 检查。

## 同步上游

不要把 Mastra 整个 monorepo 合入这里。升级时下载目标 tag，对比它的 `packages/playground` 与本应用，按目录同步 Apache-2.0 源码，并保留 `vite.config.ts` 中的 ARC 配置：

```bash
git diff --no-index apps/mastra-studio/src /path/to/mastra/packages/playground/src
```

任何名为 `ee/` 的上游目录都不要复制。它们采用 Mastra Enterprise License；本应用已移除依赖该源码的 Signals 企业版路由。具体基线见 `apps/mastra-studio/UPSTREAM.md`。

## 生产部署边界

ARC Web 构建会通过同域的 `/internal/mastra-studio/` 提供 Studio。该入口拥有 Agent、Workflow 和 Tool 的完整调试能力，因此外层 `/platform` 权限检查不可绕过。Mastra API 的 `/api/platform/mastra/*` 管理员中间件仍是最终的数据权限边界；即使有人直接请求静态入口，也无法绕过 API 权限读取或修改业务数据。
