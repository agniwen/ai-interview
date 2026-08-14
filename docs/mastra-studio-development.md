# Mastra Studio 二次开发

Mastra Studio 已直接集成到 ARC 的 TanStack Start 应用中，不再通过独立 Vite 应用或 iframe 加载。页面复用 Platform 权限、布局和主题，API 仍挂载到同一个 Mastra 实例。

## 代码位置

```text
apps/ai-recruitment-copilot/src/
├── routes/platform.mastra-studio*.tsx
│   └── TanStack Router 路由声明、loader 和薄页面组合
└── components/features/mastra-studio/
    ├── upstream/       # 可修改的 Mastra Studio 社区版运行时源码
    ├── router/         # TanStack Router 适配、布局与 Provider
    ├── css/            # Playground 样式隔离
    ├── mastra-studio-config.ts
    ├── UPSTREAM.md     # 上游版本与 ARC 差异
    └── UPSTREAM_LICENSE.md
```

`upstream/ee` 不得加入仓库；企业版源码不属于当前集成范围。

## 本地启动

安装依赖并启动 ARC Web：

```bash
pnpm install
pnpm --filter @arc/ai-recruitment-copilot dev
```

登录平台管理员后访问 `/platform/mastra-studio`。前端请求统一使用 `/api/platform/mastra/*`，该接口位于 Platform 管理员中间件之后，并连接业务运行时使用的 Mastra 单例，不需要再启动第二个 Studio 前端或 4111 端口的 Mastra 实例。

## 路由与组件约束

- `src/routes/` 只放 TanStack Router route module；页面实现、兼容层和状态放在 `components/features/mastra-studio/`。
- Studio 父路由使用 `ssr: false`，避免浏览器专用 API 参与服务端渲染。
- React Router 行为由 `router/react-router-compat.tsx` 收敛；新增页面优先使用 TanStack Router 原生的 route params、search validation 和类型安全导航。
- Platform sidebar 的 `Manage` / `Mastra` tab 由 URL 决定。Mastra 菜单属于 Platform sidebar，不要恢复上游的主 sidebar。

## 主题、样式与弹层

外层 `next-themes` 是唯一主题来源。`ScopedMastraTheme` 将宿主的 `resolvedTheme` 同步到 Studio 容器；Studio 设置页不提供第二套主题选择，也不应修改 `document.documentElement`。

`@mastra/playground-ui` 的 root selector 和 base layer 会在 Vite 构建阶段限制到 `.mastra-studio-theme`。Dialog、Popover、Tooltip 等 portal 也挂载到该容器。修改上游样式后必须检查 Platform 其他页面在访问 Studio 前后的视觉表现。

## 修改与验证

```bash
pnpm --filter @arc/ai-recruitment-copilot typecheck
pnpm --filter @arc/ai-recruitment-copilot test
pnpm --filter @arc/ai-recruitment-copilot build
pnpm check
```

生产构建会把 Studio 作为 TanStack Router 子路由自动拆包，不再执行单独的 Studio build/copy 流程。

## 同步 Mastra 上游

当前集成是宿主内的 TanStack Router fork。升级 Mastra Studio 时，只同步社区版页面和组件，不要覆盖以下 ARC 边界：

- `router/` 下的 TanStack Router 适配和布局；
- `mastra-studio-config.ts` 的同源 API/WS 路径；
- 外层主题同步、CSS scope 和 portal container；
- Platform 权限与 sidebar 结构；
- 为宿主 strict TypeScript 和依赖版本添加的兼容修改。

上游新增路径时，需要在 `src/routes/platform.mastra-studio*.tsx` 中补充薄 route module，并更新 route structure 测试。不要复制 `ee/` 目录。

## 权限边界

所有 Studio 页面位于 `/platform` 父路由下，先经过 Platform 管理员检查。Mastra API 的 `/api/platform/mastra/*` 管理员中间件仍是数据权限边界；前端路由守卫只负责体验，不能替代服务端授权。
