# Mastra Studio 二次开发

完整的 Mastra Studio 作为独立源码仓库维护，避免它的 React Router、构建配置和内部 workspace 依赖进入 ARC 主仓库。

## 本地目录

默认目录结构：

```text
dev/
├── ai-interview/   # ARC 主项目
└── mastra-studio/  # Mastra 官方完整仓库的 arc-studio 分支
```

当前源码基于 `mastra@1.18.2`，Studio 代码位于相邻仓库的 `packages/playground/`，公共 UI 位于 `packages/playground-ui/`。

如需使用其他目录，启动前设置：

```bash
export MASTRA_STUDIO_SOURCE_DIR=/absolute/path/to/mastra
```

## 首次安装与启动

在 Studio 源码仓库安装依赖：

```bash
pnpm --dir ../mastra-studio install
```

分别启动可修改的 Studio 源码和 ARC Web：

```bash
pnpm mastra:studio:source
pnpm --filter @arc/ai-recruitment-copilot dev
```

访问 `/platform/mastra-studio`。ARC 开发服务器会将 `/internal/mastra-studio/*` 同域代理到 `http://localhost:5173`；可通过 `MASTRA_STUDIO_DEV_URL` 修改目标地址。Studio API 使用 `/api/platform/mastra/*`，该路由位于现有平台管理员中间件之后，并直接绑定业务运行时使用的同一个 Mastra 单例，不需要再启动第二个 4111 实例。

## 绑定自己的 Fork

当前相邻源码仓库把官方仓库命名为 `upstream`，开发分支为 `arc-studio`。创建自己的远程 Fork 后执行：

```bash
git -C ../mastra-studio remote add origin <your-fork-url>
git -C ../mastra-studio push -u origin arc-studio
```

以后所有 Studio 定制都提交到该仓库。同步官方版本时，先获取上游 tag，再将目标版本合入 `arc-studio`，解决冲突后重新验证 Studio：

```bash
git -C ../mastra-studio fetch upstream --tags
git -C ../mastra-studio merge <new-mastra-tag>
```

## 生产部署边界

构建后的 Studio 必须通过同域的 `/internal/mastra-studio/` 提供，并由反向代理保留此前缀。该入口拥有 Agent、Workflow 和 Tool 的完整调试能力，因此外层 `/platform` 权限检查不可绕过，也不应单独公开 Studio 服务地址。
