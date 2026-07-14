# Mastra Studio 嵌入 TanStack Start + Hono 的可行性调查

日期：2026-07-14
调查基线：本仓库使用 `mastra@1.18.2`、`@mastra/core@1.50.1`，上游对应标签为 [`mastra@1.18.2`](https://github.com/mastra-ai/mastra/tree/mastra%401.18.2)。本文只依据 Mastra 官方文档和 `mastra-ai/mastra` 官方源码。

## 结论

> 决策更新：在确认需要修改 Studio 内部功能后，项目采用本文“源码集成”方案的收敛版本：只将 `packages/playground` 的 Apache-2.0 SPA 源码放入 `apps/mastra-studio`，并使用官方已发布依赖；不复制整个 Mastra monorepo，也不复制任何 `ee/` 目录。

可以嵌入，而且官方已经考虑了这种场景：Studio 是连接 Mastra Server 的 React SPA；官方认证文档明确说明，外部应用“嵌入或链接 Studio”时可以通过 `auth_header` URL 参数交接授权令牌。[Studio deployment](https://mastra.ai/docs/studio/deployment)；[Studio auth：Pass a token through the URL](https://mastra.ai/docs/studio/auth#pass-a-token-through-the-url)

但“可嵌入”不等于“有一个可安装的 `<MastraStudio />` React 组件”。`1.18.2` 的 Studio 源码位于上游 [`packages/playground`](https://github.com/mastra-ai/mastra/tree/mastra%401.18.2/packages/playground)，其包名是 `@internal/playground`，并标记为 `private: true`；公开导出也只有少量 framework/store/theme 工具，并未导出完整 Studio App。因此，官方稳定交付面是 **SPA 静态产物 + Mastra REST API**，不是供 TanStack Start 直接 import 的组件库。[package.json](https://github.com/mastra-ai/mastra/blob/mastra%401.18.2/packages/playground/package.json)；[exports.ts](https://github.com/mastra-ai/mastra/blob/mastra%401.18.2/packages/playground/src/exports.ts)

对当前仓库，建议采用：

1. 优先用同批发布的 `@mastra/tanstack-start@0.2.5`，把同一个 `mastra` 实例的官方 API 挂到 TanStack Start catch-all server route，例如 `/mastra-api/$`。[adapter source](https://github.com/mastra-ai/mastra/tree/mastra%401.18.2/server-adapters/tanstack-start)
2. 用现有登录/平台管理员权限保护 `/mastra-api/*` 和 Studio 页面/静态入口。
3. 通过 `mastra` npm 包自带的 `dist/studio` 静态产物，在同源子路径（例如 `/internal/mastra-studio`）提供 Studio。
4. 在 TanStack Start 的 Agent 调试页中用 iframe 展示该同源子路径；外层保留产品导航、权限边界和页面布局。

这是“官方静态产物 + 官方 TanStack Start adapter + 薄 iframe 壳”，不是 fork Studio。它能拿到官方完整功能和后续升级，同时把定制面限制在外层页面。源码 fork 仅适合确实要修改 Studio 内部导航、页面或交互时使用。

## 官方支持的运行和部署方式

官方把 Studio 定义为“运行在浏览器、连接到一个正在运行的 Mastra server 的 React SPA”，支持托管 Studio或自托管；自托管又可与 Mastra server 同服务或作为单独 SPA 部署。[Studio deployment](https://mastra.ai/docs/studio/deployment)

| 方式                    | 官方行为                                                                                                                                                                                                                                                                                                                                                        | 对当前项目的意义                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `mastra dev`            | 同时运行开发用 Studio 和 Mastra API，默认 `http://localhost:4111`。[Studio overview](https://mastra.ai/docs/studio/overview#start-studio)                                                                                                                                                                                                                       | 适合本地查看，不应作为 TanStack 应用内的生产集成方式。                                     |
| `mastra studio`         | 只启动静态 Studio，默认端口 `3000`，默认连接 `http://localhost:4111/api`；可指定 server host/port/protocol/API prefix。[CLI reference](https://mastra.ai/reference/cli/mastra#mastra-studio)                                                                                                                                                                    | 可作为独立进程，并由 Nginx/网关反代到产品域名下。                                          |
| 子路径托管              | 设置 `MASTRA_STUDIO_BASE_PATH=/agents`，CLI 会调整 HTML base URL 和静态资源路由。[Studio deployment：Quickstart](https://mastra.ai/docs/studio/deployment#quickstart)                                                                                                                                                                                           | 可以把 Studio 放到 `/internal/mastra-studio`，避免与 TanStack Router 路由冲突。            |
| `mastra build --studio` | 构建 Mastra server 并带上 Studio；文档描述 `.mastra/output/studio`，当前 Mastra server 部署文档的输出树称为 `playground/`，运行时由 `MASTRA_STUDIO_PATH` 指定。[Studio deployment：Alongside your API](https://mastra.ai/docs/studio/deployment#alongside-your-api)；[Mastra server build output](https://mastra.ai/docs/deployment/mastra-server#build-output) | 更适合独立部署 Mastra 生成的服务器，不适合直接替代当前 TanStack Start + 自有 Hono server。 |
| 手工静态 SPA/CDN        | 官方示例从 `node_modules/mastra/dist/studio` 复制产物，并在构建时替换 `%%MASTRA_*%%` 占位符。[Studio deployment：Using a CDN](https://mastra.ai/docs/studio/deployment#using-a-cdn)                                                                                                                                                                             | 最接近把静态产物纳入现有 Vite/TanStack 构建；不能只复制文件而不处理动态配置。              |

需要注意：官方明确说明构建产物不能原样丢到 CDN，因为 UI 依赖动态配置；官方 Vite 示例会复制 `mastra/dist/studio` 并替换 HTML 中的环境变量占位符。[Studio deployment：Manual CDN setup](https://mastra.ai/docs/studio/deployment#manual)

## Studio 源码、包和许可证

### 源码与构建产物

- 完整 Studio App 源码位于 [`packages/playground`](https://github.com/mastra-ai/mastra/tree/mastra%401.18.2/packages/playground)。它使用 React 19、React Router 7、TanStack Query、Zustand、Tailwind、CodeMirror、XYFlow、Recharts、LiveKit Client 等较多依赖；完整清单见上游 [`package.json`](https://github.com/mastra-ai/mastra/blob/mastra%401.18.2/packages/playground/package.json)。
- Studio 自己创建 `BrowserRouter`，并以 `MASTRA_STUDIO_BASE_PATH` 作为 basename；随后用 `MastraReactProvider` 连接配置的 server base URL 与 API prefix。[App.tsx](https://github.com/mastra-ai/mastra/blob/mastra%401.18.2/packages/playground/src/App.tsx)
- `mastra@1.18.2` CLI 包会把构建好的 Studio 放在其 `dist/studio` 中。官方 CDN 示例也以 `node_modules/mastra/dist/studio` 为复制源。[Studio deployment](https://mastra.ai/docs/studio/deployment#manual)
- Studio 的 `index.html` 通过 `%%MASTRA_SERVER_*%%`、`%%MASTRA_API_PREFIX%%`、`%%MASTRA_STUDIO_BASE_PATH%%` 等变量配置 API 与资源路径。[index.html](https://github.com/mastra-ai/mastra/blob/mastra%401.18.2/packages/playground/index.html)
- `mastra studio` 的服务器读取上述模板、替换配置，并对非静态资源路径返回 SPA shell；源代码使用 Node `http` 与 `serve-handler`。[CLI studio server](https://github.com/mastra-ai/mastra/blob/mastra%401.18.2/packages/cli/src/commands/studio/studio.ts)

因此，本仓库已经安装 `mastra@1.18.2` 时，**无需为了嵌入而额外把整个上游仓库复制进来**。可以直接消费版本锁定的 `node_modules/mastra/dist/studio` 产物。拉源码的价值主要是审计或准备 fork，不是运行 Studio 的前置条件。

### 许可证

Mastra 仓库采用双许可证：不在任意 `ee/` 目录中的内容按 Apache-2.0；任意 `ee/` 目录下内容适用 Mastra Enterprise License。[LICENSE.md](https://github.com/mastra-ai/mastra/blob/mastra%401.18.2/LICENSE.md)；[EE license](https://github.com/mastra-ai/mastra/blob/mastra%401.18.2/ee/LICENSE)

`packages/playground` 的普通源码可在 Apache-2.0 条款下修改和再分发，但 Studio 源树内的 `ee/` 代码以及相关服务端 EE 能力不能按 Apache-2.0 处理。官方也明确说明 Studio 的 SSO、RBAC 和权限感知 UI 属于 Enterprise Edition：本地开发和 Simple Auth 可用，生产环境接第三方 provider 需要有效 EE 许可证。[Studio auth：EE licensing](https://mastra.ai/docs/studio/auth#ee-licensing)

## Studio 依赖什么 API

Studio 不是读取本项目自定义的 `/api/w/:slug/studio/agent-debug/*` 接口。它通过 `@mastra/react` / `@mastra/client-js` 访问 Mastra Server 的标准 REST API，涵盖 agents、workflows、tools、memory、datasets、experiments、observability 等。[Studio overview](https://mastra.ai/docs/studio/overview#primitives)

官方 Server Adapter 会在现有服务器上自动注册这些 Mastra middleware 和 endpoints；Hono 用法是把现有 `app` 和 `mastra` 实例传给 `@mastra/hono` 的 `MastraServer`，然后调用 `init()`。[Server adapters](https://mastra.ai/docs/server/server-adapters#configuration)；[Hono adapter reference](https://mastra.ai/reference/server/hono-adapter)

与当前项目更直接相关的是，`mastra@1.18.2` 标签同时包含官方 `@mastra/tanstack-start@0.2.5` adapter。它导出 `createStartRouteHandler({ mastra, prefix })`，内部懒初始化 `@mastra/hono`，并为 TanStack Start catch-all server route 生成 GET、POST、PUT、DELETE、PATCH、OPTIONS、HEAD handlers。[package.json](https://github.com/mastra-ai/mastra/blob/mastra%401.18.2/server-adapters/tanstack-start/package.json)；[adapter source](https://github.com/mastra-ai/mastra/blob/mastra%401.18.2/server-adapters/tanstack-start/src/index.ts)

官方还专门提供了 `prefix` 选项，解决现有应用已经拥有 `/api` 路由时的冲突，例如 `prefix: '/api/v2'`。[Server adapters：Route prefixes](https://mastra.ai/docs/server/server-adapters#route-prefixes) 当前仓库的自定义 `src/server.ts` 会先把所有 `/api/*` 请求交给业务 Hono app，因此最小改动是使用 `/mastra-api` 这类非 `/api` 前缀，并新增对应 TanStack catch-all route；另一种做法是显式调整 `server.ts` 分流，再使用 `/api/mastra`。Studio 的 `MASTRA_API_PREFIX` 必须与最终前缀一致。

当前仓库的事实是：

- `apps/ai-recruitment-copilot-backend/src/mastra/index.ts` 已定义供 CLI Studio 使用的 Mastra 实例。
- `apps/ai-recruitment-copilot-backend/src/server/agents/mastra/index.ts` 另有生产运行时 Mastra 实例。
- `createServerApp()` 目前只挂载业务 Hono routes；TanStack Start 的 `server.ts` 又会抢先代理所有 `/api/*` 请求。

所以，仅把 Studio iframe 放进 TanStack 页面并不会工作；还必须让它连接到独立 `mastra dev/build` server，或者通过官方 Start/Hono adapter 暴露标准 Mastra endpoints。为了避免“Studio 调试的实例”和“生产代码调用的实例”继续分叉，实施前应先统一实例工厂或明确两者只在 storage/observability 配置上有受控差异。否则 Studio 可能看不到线上调用产生的 trace，Editor 中的覆盖配置也未必作用于生产调用实例。

## 三种嵌入方案比较

### 1. iframe

做法：Studio 仍是完整 SPA，在 TanStack Start 的受保护页面中放一个 iframe；iframe URL 指向独立 Studio 域名或同源子路径。

优点：

- 与现有 TanStack Router、React Query、Tailwind 和 shadcn 样式完全隔离。
- 升级时替换 `mastra` 版本及静态产物即可，最少维护 fork。
- 官方 auth 文档明确覆盖外部应用“嵌入或链接”Studio 的 token 交接场景。[Studio auth](https://mastra.ai/docs/studio/auth#pass-a-token-through-the-url)

限制：

- 官方没有公开 iframe SDK、React 组件或 `postMessage` 协议；无法稳定地从外层控制 Studio 内部路由、主题、选中 workflow 或事件。
- 跨域 iframe 需要 CORS；同源反向代理更简单。官方部署文档要求独立部署时正确配置 CORS。[Studio deployment：Running a server](https://mastra.ai/docs/studio/deployment#running-a-server)
- `auth_header` 只存在内存并在 reload 后消失；它出现在初始 URL 时也可能暴露到浏览器历史、Referer 或访问日志，官方要求宿主应用自行承担这一风险。[Studio auth](https://mastra.ai/docs/studio/auth#pass-a-token-through-the-url)
- 外层页面已登录不等于 iframe/API 已被安全保护。必须同时保护 Studio 资源和 Mastra API。官方警告 Studio 对 agents、workflows、tools 有完整访问能力，生产必须置于认证、VPN 等保护后。[Studio deployment](https://mastra.ai/docs/studio/deployment#running-a-server)

判断：**最适合当前项目**，优先使用同源子路径，避免通过 URL 传长期 Better Auth token。

### 2. 反向代理，不使用 iframe

做法：网关把 `/internal/mastra-studio/*` 反代给 `mastra studio`，TanStack 侧通过普通链接跳转到该 SPA；也可以在网关把 Mastra API 放到同域独立 prefix。

优点：

- 也是官方静态 SPA 部署模型；`MASTRA_STUDIO_BASE_PATH` 专门支持 Nginx 等代理下的子路径。[Studio deployment](https://mastra.ai/docs/studio/deployment#quickstart)
- 同域可避免跨域 CORS，并让网关统一做认证、审计和 CSP。
- 不需要把 Studio 代码编进 TanStack Start 客户端 bundle。

限制：

- 页面会离开 ARC 的应用 shell；若要保留 sidebar/header，仍需 iframe 或 fork Studio layout。
- 需要额外 Node 进程，除非在 TanStack/Nitro 服务中自行提供已替换配置的静态产物。
- SPA fallback 必须只作用在 Studio 子路径，不能吞掉 TanStack routes。官方 CLI 源码对所有非静态资源返回 Studio shell，因此反代边界必须精确。[CLI studio server](https://github.com/mastra-ai/mastra/blob/mastra%401.18.2/packages/cli/src/commands/studio/studio.ts)

判断：适合先做低风险 POC，或接受“进入独立管理台”的产品体验。

### 3. 拉取源码并直接集成

做法：把 `packages/playground` 和必要的 workspace 包 fork/vendor 到本 monorepo，修改入口、路由和 layout，使 Studio 成为 ARC 内部页面。

优点：可以深度调整导航、主题、文件上传、workspace selector、默认 request context，以及直接增加 ARC 专用页面。

限制：

- `@internal/playground` 是 private 上游 workspace package，不是官方承诺兼容性的公共嵌入 API。[package.json](https://github.com/mastra-ai/mastra/blob/mastra%401.18.2/packages/playground/package.json)
- 它自行创建 React Router `BrowserRouter`、TanStack Query provider 和 Mastra provider，不能无修改地塞进 TanStack Router route。[App.tsx](https://github.com/mastra-ai/mastra/blob/mastra%401.18.2/packages/playground/src/App.tsx)
- 依赖面很大，并使用上游 workspace 版本关系；每次 Mastra 升级都要解决源码冲突和 API 变更。[package.json](https://github.com/mastra-ai/mastra/blob/mastra%401.18.2/packages/playground/package.json)
- 必须区分 Apache-2.0 与所有 `ee/` 目录，不能把 EE 源码误当普通开源代码发布。[LICENSE.md](https://github.com/mastra-ai/mastra/blob/mastra%401.18.2/LICENSE.md)

判断：技术上可行，当前阶段不推荐。只有 iframe POC 已证明功能价值、且明确列出必须修改的 Studio 内部能力后，再 fork 固定 tag，并建立上游同步策略。

## 推荐的目标结构

```text
Browser
└── ARC TanStack Start page（Better Auth + platform-admin guard）
    └── iframe /internal/mastra-studio/
        ├── 静态资源：mastra@1.18.2/dist/studio
        └── REST/SSE → 同源 /mastra-api/*
                         └── @mastra/tanstack-start catch-all route
                             └── @mastra/hono MastraServer（adapter 内部）
                                 └── 统一的 ARC Mastra instance
```

推荐实施顺序：

1. **实例收敛**：先消除或明确两份 Mastra 实例的职责，保证 Studio 所读的 storage/observability 与真实运行链路一致。
2. **API 验证**：用 `@mastra/tanstack-start` 在 `/mastra-api/$` 暴露标准 endpoints，验证 agents、workflows、stream、observability；如果 Start adapter 无法满足自定义中间件顺序，再退回直接使用 `@mastra/hono`。
3. **权限边界**：在调用 adapter handler 前执行现有 Better Auth 平台管理员校验。不要只依赖 iframe 外层页面不可见，也不要把完整 Studio 权限直接开放给普通 workspace admin。
4. **静态产物**：构建时从锁定版本的 `mastra/dist/studio` 复制产物并替换 `MASTRA_STUDIO_BASE_PATH`、server endpoint、API prefix；不要提交上游完整源码。
5. **页面壳**：新增薄 TanStack route 和 feature component，只负责权限、iframe 尺寸、loading/error skeleton、打开独立窗口。
6. **安全加固**：同源部署；仅允许本域 frame；不使用长期 token query；保护 Studio 静态入口与 API；关闭不需要的 cloud CTA/telemetry；记录敏感 workflow 执行审计。
7. **再决定是否 fork**：收集实际缺口。若只是需要 ARC 文件上传或 request context，可优先使用 Studio 已支持的 schema-driven workflow input、request context presets 或外层辅助入口，不立即复制整个 Studio。

## 实施前必须确认的两点

1. **Mastra 实例唯一性**：CLI Studio 实例和生产实例目前是两份构造。若 Studio 修改 Editor 中的 DB override，而生产调用的是另一实例/另一 storage 行为，需要验证修改是否能被生产调用读取。
2. **权限模型**：若沿用 Better Auth 而不购买 Mastra EE，应由 TanStack catch-all handler 的外层守卫对 `/mastra-api/*` 做强制平台管理员授权；不能依赖外层 iframe 页面不可见来保护 API。若使用 Mastra Studio 的第三方 SSO/RBAC，则按官方说明需要评估 EE 许可证。[Studio auth：EE licensing](https://mastra.ai/docs/studio/auth#ee-licensing)

## 最终建议

先做 **同源 iframe + `/mastra-api` TanStack Start adapter + 官方静态产物** 的 POC。不要现在把 `packages/playground` 源码复制进项目。

这个方案已经是“完整官方 Studio 嵌入 ARC”，不是现有简化调试页；它保留官方 Workflow graph、step-by-step、traces、datasets、experiments、tools、request context 和 Editor 等能力，同时把升级成本和许可证边界控制在最小范围。现有 Agent 调试页可以保留为 ARC 专用快捷调试入口，也可以在验证后逐步收缩为打开 Studio 的壳。
