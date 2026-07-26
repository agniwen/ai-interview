# Sidebar tabs 导航并发与 Suspense 性能优化实施文档

## 目标

改善 workspace 顶部 Agent / Studio tabs 切换时的感知流畅度，同时保持当前路由语义、权限校验、sidebar 协调动画和错误处理不变。

本文记录实现方案及落地状态。优化顺序遵循：

1. 给非 `Link` tabs 补齐意图预加载。
2. 缩短 Studio 导航的阻塞数据链。
3. 将非关键数据移出路由关键路径，并用局部 Suspense 渐进展示。
4. 复用 Router pending 状态提供轻量反馈。
5. 基于实测决定是否隔离隐藏 sidebar slot 的更新。

## 实施状态

已于 2026-07-26 完成前三个确定性优化：

- tabs pointer/focus/touch intent 使用 typed `router.preloadRoute()`。
- Studio layout 复用 workspace 父 match 权限快照；招聘台 server function 保留 page +
  resource 双重可信授权。
- metrics 脱离 route 关键路径，改为受双重授权保护的 typed endpoint，并在
  `ClientOnly` 内使用局部 `Suspense + useSuspenseQuery`；候选人详情不再加载 metrics。

阶段 4 的额外 pending indicator 和阶段 5 的隐藏 slot 隔离仍保持条件式：只有浏览器
Profiler/Network 基线证明前三阶段后仍存在相应瓶颈时才实施，避免叠加第二套状态或破坏
现有 sidebar 协调动画。

## 非目标

- 不在 `navigate()` 外重复调用 React `startTransition`。
- 不用一个覆盖整个 app shell 的大 Suspense fallback 替换已展示内容。
- 不为了减少挂载组件而破坏现有跨路由 sidebar slot 退出动画或状态保留。
- 不先调低 `pendingMs` / `pendingMinMs` 来制造“更快”的 loading UI。
- 不在没有性能基线的情况下重构全部 Studio 数据访问层。

## 已核实的技术基线

### 1. 当前 Router 导航已经使用 React Transition

React 官方建议支持 Suspense 的 Router 默认把页面导航标记为 Transition；这样导航可以保持已展示内容，避免无必要地回退到大范围 fallback。来源：

- [React `useTransition`：Building a Suspense-enabled router](https://react.dev/reference/react/useTransition#building-a-suspense-enabled-router)
- [React `Suspense`：Preventing already revealed content from hiding](https://react.dev/reference/react/Suspense#preventing-already-revealed-content-from-hiding)

当前安装的 TanStack Router React 适配层已将 Router 的 transition wrapper 实现为 `React.startTransition`：

- `node_modules/.pnpm/@tanstack+react-router@1.170.17_react-dom@19.2.7_react@19.2.7__react@19.2.7/node_modules/@tanstack/react-router/src/Transitioner.tsx:26`

Router core 在加载新 location 和提交 ready matches 时都会调用该 wrapper：

- `node_modules/.pnpm/@tanstack+router-core@1.171.14/node_modules/@tanstack/router-core/src/router.ts:2474`
- `node_modules/.pnpm/@tanstack+router-core@1.171.14/node_modules/@tanstack/router-core/src/router.ts:2507`

同一安装版本的导航选项已经把 `startTransition` 标记为 deprecated，原因是所有导航都会在内部使用它：

- `node_modules/.pnpm/@tanstack+router-core@1.171.14/node_modules/@tanstack/router-core/src/link.ts:324`

因此 tabs 点击处理器不应再写：

```tsx
startTransition(() => {
  void navigate({ to: target });
});
```

这只会重复表达 Router 已负责的更新优先级，不会缩短代码 chunk、loader、server function、数据库查询或网络请求耗时。React 也明确说明 `startTransition` 会立即执行传入函数；它标记的是状态更新优先级，不是一个延迟执行或数据缓存 API。来源：

- [React `useTransition` caveats](https://react.dev/reference/react/useTransition#caveats)

### 2. 当前全局 intent preload 只自动覆盖 `Link`

项目 Router 当前配置：

```tsx
defaultPendingMinMs: 300,
defaultPendingMs: 350,
defaultPreload: "intent",
```

来源：

- `apps/ai-recruitment-copilot/src/router.tsx:18`

TanStack Router 官方定义的 intent preload 由 `Link` 的 hover 和 touch-start 事件触发；设置 `defaultPreload: "intent"` 会为应用中的 `Link` 默认启用这一行为。来源：

- [TanStack Router Preloading：Supported Preloading Strategies](https://tanstack.com/router/latest/docs/guide/preloading#supported-preloading-strategies)
- [TanStack Router Preloading：defaultPreload](https://tanstack.com/router/latest/docs/guide/preloading)

对于不是 `Link` 的交互控件，官方提供 `router.preloadRoute()`；它接受标准 navigate options，并返回预加载完成的 Promise。来源：

- [TanStack Router Preloading：Preloading Manually](https://tanstack.com/router/latest/docs/guide/preloading#preloading-manually)
- `node_modules/.pnpm/@tanstack+router-core@1.171.14/node_modules/@tanstack/router-core/src/router.ts:2889`

结论：Base UI tabs 通过 `useNavigate()` 切换时不会仅凭 `defaultPreload: "intent"` 自动获得 `Link` 的 hover/touch 预加载。第一阶段应该补的是 `router.preloadRoute()`，不是额外的 `startTransition`。

### 3. Pending 阈值控制 fallback 时机，不缩短真实加载

TanStack Router 默认只在 loader 超过 `pendingMs` 后显示 `pendingComponent`；`pendingMinMs` 则保证一旦 fallback 出现，会至少保持一段时间，避免一闪而过。来源：

- [TanStack Router Data Loading：Showing a pending component](https://tanstack.com/router/latest/docs/guide/data-loading#showing-a-pending-component)
- [TanStack Router Data Loading：Avoiding Pending Component Flash](https://tanstack.com/router/latest/docs/guide/data-loading#avoiding-pending-component-flash)
- `node_modules/.pnpm/@tanstack+router-core@1.171.14/node_modules/@tanstack/router-core/src/load-matches.ts:322`
- `node_modules/.pnpm/@tanstack+react-router@1.170.17_react-dom@19.2.7_react@19.2.7__react@19.2.7/node_modules/@tanstack/react-router/src/Match.tsx:445`

项目使用 `350ms / 300ms`，比官方文档描述的默认 `1000ms / 500ms` 更早显示、也更快退出。因此第一轮不调整这两个值；先减少实际等待并记录 navigation timing。过早降低 `pendingMs` 会增加短导航展示 fallback 的概率，增大视觉噪音。

### 4. 当前 TanStack Start 构建已经执行自动路由代码分割

TanStack Router 的自动代码分割会把 route component、error component 和 not-found component 等非关键配置变成按需 chunk；loader 默认保留在关键 route 配置中，以便尽早启动数据加载。来源：

- [TanStack Router Code Splitting](https://tanstack.com/router/latest/docs/guide/code-splitting)
- [TanStack Router Automatic Code Splitting](https://tanstack.com/router/latest/docs/guide/automatic-code-splitting)

当前应用使用 `tanstackStart()` Vite plugin：

- `apps/ai-recruitment-copilot/vite.config.ts:93`

当前安装的 Start plugin 同时安装 client/server route code splitter：

- `node_modules/.pnpm/@tanstack+start-plugin-core@1.171.19_@tanstack+react-router@1.170.17_react-dom@19.2.7_r_c92ded7735bcf31765b6c3873532c2ff/node_modules/@tanstack/start-plugin-core/src/vite/start-router-plugin/plugin.ts:145`

这意味着 `preloadRoute()` 不只是预先跑数据生命周期，也可以提前加载目标 route 的按需组件 chunk。第一阶段不需要新增 `React.lazy` 或手写 `.lazy.tsx` 拆分；先验证现有 route chunk 是否在 tab intent 时被提前请求。

不要为了进一步切包默认把 loader 拆成独立 chunk。TanStack 官方指出，这会先等待 loader chunk，再执行 loader，形成额外网络往返；只有 bundle 分析证明确有必要时才考虑。来源：

- [TanStack Router Automatic Code Splitting：Splitting the Data Loader](https://tanstack.com/router/latest/docs/guide/automatic-code-splitting#splitting-the-data-loader)

### 5. Suspense 只对支持 Suspense 的资源生效

React Suspense 不会自动检测 Effect 或普通事件处理器里的数据请求。它能响应的资源包括 lazy-loaded code、通过 `use()` 读取的稳定 Promise，以及框架或数据层提供的 Suspense-enabled API。来源：

- [React Suspense：What activates a Suspense boundary](https://react.dev/reference/react/Suspense#what-activates-a-suspense-boundary)

因此仅在现有组件外包一层 `<Suspense>`，但继续在 `useEffect` 中加载数据，不会得到导航优化。后续必须选择真实的 suspend 点：

- Router loader 返回未等待的 Promise，由 `<Await>` 或 React 19 `use()` 读取；或
- loader 启动 TanStack Query prefetch，组件用 `useSuspenseQuery` 读取。

## 项目代码链审计

### 1. tabs 的即时状态和正式导航来自不同层

`SidebarTabs` 当前由 URL 反推 active tab，而不是在点击时先写一份本地 active state：

- `apps/ai-recruitment-copilot/src/components/layout/app-sidebar/sidebar-tabs.tsx`
- `apps/ai-recruitment-copilot/src/components/layout/app-sidebar/sidebar-slot-transition.tsx`

点击后，Base UI tabs 通过 `onValueChange` 导航到：

- Agent：`/w/$slug/agent`
- Studio：`/w/$slug/studio/resumes`

`value` 只有在 Router location 更新后才改变。因此手写 `useTransition` 不会让 indicator
提前切换；它只会再次降低同一次 Router 导航更新的优先级。第一阶段若需要提升“点击即有
反馈”的感受，应使用 Router pending 状态绘制不改变布局的反馈，而不是维护一个可能与
redirect/not-found 脱节的 optimistic active tab。

当前 `activationMode="manual"` 有明确的行为约束：避免 toast 关闭后恢复焦点时触发自动
tab 导航。实现 preload 时必须保留这个模式，不能仅为了获得 `Link` 的自动 intent 行为而
改变焦点激活语义。

### 2. Agent → Studio 招聘台存在重复访问解析

当前冷导航会涉及以下访问链：

| 顺序 | 位置                                    | 调用                                | 作用                                              |
| ---- | --------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| 1    | `routes/w.$slug.tsx`                    | `getWorkspaceAccessState`           | session、workspace、member、完整权限快照          |
| 2    | `routes/w.$slug.studio.tsx`             | `getStudioPageAccessState`          | 再次解析 workspace，并检查 `page:resumes`         |
| 3    | `routes/w.$slug.studio.resumes.tsx`     | `requireStudioPageAccess`           | 第三次解析 workspace，并再次检查 `page:resumes`   |
| 4    | `lib/start/studio/resumes.functions.ts` | `resolveWorkspaceAccessFromRequest` | 第四次解析 workspace，并检查 `resumeLibrary:read` |

这些 route loaders 可以有并行部分，所以“4 次”不等于 4 段完整串行瀑布；但第 3 步明确
位于第 4 步之前，并且每次访问解析都可能执行 session、组织列表、member 查询和权限快照
计算。它们是确定存在的重复工作。

父 route 的 loader 已返回可信的 `WorkspaceAccessState`，其中包含完整
`permissions`。当前 Router loader context 也提供 `parentMatchPromise`，父 match
包含 `loaderData`：

- `node_modules/.pnpm/@tanstack+router-core@1.171.14/node_modules/@tanstack/router-core/src/route.ts:1512`
- `node_modules/.pnpm/@tanstack+router-core@1.171.14/node_modules/@tanstack/router-core/src/Matches.ts:154`

因此 Studio layout 的页面级判断可以复用父 match 的服务端产出，不需要再次调用
`getStudioPageAccessState`。但 `loadStudioResumesState` 是独立 HTTP/server-function
边界，不能信任客户端把父 loader 的权限对象作为参数传回；它仍必须自行解析访问状态并
同时检查：

- `page:resumes`
- `resumeLibrary:read`

完成这一步后，resumes 子 route 才能安全删除自己串行的
`requireStudioPageAccess`。目标是把本次导航的访问解析从最多 4 次降为 2 次，而不是删除
后端授权。

### 3. 招聘台把非关键 metrics 放在了 route ready 之前

`loadStudioResumesData` 当前并行启动：

- 主列表第一页 `prefetchInfiniteQuery`
- `loadResumeLibraryMetrics`

但随后对两者 `await Promise.all(...)`，所以 route 必须等慢的一方完成。metrics 本身又
并行执行 3 个数据库聚合：

- pipeline/outcome 分桶
- 近 30 天每日新增
- 已发起/未发起 AI 面试转化

对应文件：

- `apps/ai-recruitment-copilot/src/lib/start/studio/resumes.server.ts`
- `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/dao/metrics.ts`

在 UI 中，metrics 只服务于 `ResumeLibraryCharts`；主列表、筛选、上传和候选人操作并不
依赖它：

- `apps/ai-recruitment-copilot/src/components/features/studio/resumes/resume-library-page.tsx`
- `apps/ai-recruitment-copilot/src/components/features/studio/resumes/resume-library-charts.tsx`

图表现在只有 `ClientOnly` skeleton。`ClientOnly` 解决 SSR/浏览器边界，但 metrics 已经
在 route loader 中等待完成，所以它不是数据 Suspense，也不会缩短导航关键路径。

还有一项确定浪费：访问 `/studio/resumes/$recordId` 时，父 resumes route 令
`prefetchList=false`，虽然跳过了列表，却仍加载 metrics；随后父组件直接渲染 `<Outlet />`
而完全不使用 metrics。现有
`apps/ai-recruitment-copilot/src/lib/start/studio/__tests__/resumes.server.test.ts`
甚至固定了这一当前行为。实施时应先改掉这条测试所描述的浪费。

### 4. sidebar slots 的持久挂载是有意设计

`WorkspaceSidebarSlots` 同时挂载 Chat 和 Studio slots，再由
`SidebarSlotTransition` 控制 active panel。现有 Motion 行为使用：

- `AnimatePresence mode="popLayout"`
- 180ms 位移/透明度协调动画
- reduced-motion 分支

`ChatSidebarSlots` 在隐藏时保留 Query cache，暂停 30 秒轮询，并在重新 active 时先显示
cache、再 refetch。这一结构支持退出动画和状态保留，不应作为第一轮优化被拆除。

仍需通过 Profiler 验证的点是：Chat query 没有 `enabled: active`，所以首次直接进入
Studio 时也会获取会话列表；切离 Agent 时还会清理多项编辑状态。它们可能与 Studio
首屏请求/commit 竞争，但目前没有证据证明是主因，故放在最后一阶段。

## 推荐实现

## 阶段 0：建立导航性能基线

在修改前分别记录冷缓存与热缓存的 Agent → Studio、Studio → Agent：

- 从 pointer/focus intent 到点击的时间。
- 点击到 Router 进入 pending 的时间。
- route chunk 请求开始/结束时间。
- loader/server function 的请求数量和瀑布关系。
- React commit 次数与最长 commit duration。
- 旧页面保持可交互的时间，以及局部/全局 fallback 是否出现。

验收基线至少覆盖：

- 鼠标 hover 后点击。
- 键盘 focus 后 Enter/Space 激活。
- touch/pointer 直接点击。
- 网络 Fast 3G 或等效限速下的冷导航。
- 已访问过目标 tab 后的热导航。

基线不是为了设定一个未经实测的绝对毫秒目标，而是为了证明每个阶段减少了哪一种等待：chunk、loader、数据查询或 React render。

## 阶段 1：为 tabs 增加 route intent preload

### 实现位置

首选只改 tabs 的 feature-owned 实现及对应测试：

- `apps/ai-recruitment-copilot/src/components/layout/app-sidebar/sidebar-tabs.tsx`
- 该组件现有或新建的相邻测试文件

### 设计

在 tabs 组件中取得 Router：

```tsx
const router = useRouter();
```

为每个 tab 建立与 `navigate()` 完全相同的 type-safe route options，并让 intent handler 调用：

```tsx
void router.preloadRoute({
  to: target,
  params: { slug },
});
```

事件覆盖：

- `onPointerEnter`：桌面鼠标/笔 hover。
- `onFocus`：键盘导航。
- `onTouchStart`，或在组件事件模型允许时使用等价的 pointer intent：触屏点击前尽早启动。

约束：

- 不在当前 tab 上重复 preload。
- `preloadRoute()` 的异常不得阻断随后正常 `navigate()`；导航仍由 Router 的正式加载/错误边界处理。
- 同一目标的连续 pointer/focus 事件应复用 Router cache 语义，不在组件中新增长期业务缓存。
- 不用 `onMouseMove` 等高频事件。
- 点击时仍只调用一次 `navigate()`；不等待 preload Promise 后再导航。

TanStack Router 官方说明 intent preload 对 `Link` 默认有 50ms 延迟；手动 preload 不自动继承该 DOM 事件策略。第一版可以直接在离散的 pointer-enter/focus/touch-start 上启动，若 profiling 发现误触导致明显请求浪费，再增加一个可取消的短延迟。来源：

- [TanStack Router Preloading：Preload Delay](https://tanstack.com/router/latest/docs/guide/preloading#preload-delay)

### 缓存归属

Router 预加载 match 是临时缓存；如果要由 TanStack Query 完整控制数据 freshness，官方建议把 Router preload stale time 设为 `0`，让 loader 每次运行、再由 Query 的 `staleTime` 判断是否需要请求。来源：

- [TanStack Router Preloading：Preloading with External Libraries](https://tanstack.com/router/latest/docs/guide/preloading#preloading-with-external-libraries)

本阶段先不全局修改 `defaultPreloadStaleTime`。原因是当前 route loaders 并未全部统一采用 Query cache；全局改为 `0` 可能让其他 route 的 loader 更频繁执行。只在把 Studio 关键数据迁移到稳定 query options 后，再评估 route-local 配置。

### 验证

- 测试 intent 时调用正确的 `preloadRoute` options。
- 当前 tab 不触发 preload。
- intent 后点击仍只触发一次导航。
- preload 失败不会让 tab 无法点击。
- DevTools Network 证明 hover/focus 后、click 前已出现目标 route chunk 或目标 loader 请求。
- 冷缓存点击到新页面可用的时间相对基线下降。

## 阶段 2：缩短 Studio 阻塞加载链

这一阶段处理真实时延，不依赖更多 React 并发 API。只收敛 Agent tab 默认目标
`/studio/resumes` 的链路，不在同一个提交迁移全部 Studio routes。

### 2.1 Studio layout 复用 workspace 父 match

修改：

- `apps/ai-recruitment-copilot/src/routes/w.$slug.studio.tsx`

实施：

1. 保留 `findStudioPageByPath`，它仍负责由 pathname 找到 page action。
2. 从 loader context 获取并等待 `parentMatchPromise`。
3. 读取 `/w/$slug` 父 match 的 `loaderData`。
4. 用 `hasPermissionInStatements(state.permissions, "page", requestedPage.action)`
   进行纯内存判断。
5. 不再调用 `getStudioPageAccessState`。
6. `/studio` 根路径的“第一个允许页面”redirect 暂不纳入本次去重；它没有明确目标 action，
   仍可保留现有 server function，或在后续单独复用同一父权限快照。

注意：等待父 match 会让 layout 权限判定依赖父 loader 完成，这是正确依赖；resumes 数据
server function 仍可由自己的子 loader 并行启动，不应人为等 layout 判断结束后再发请求。

### 2.2 数据 server function 合并两个可信授权判断

修改：

- `apps/ai-recruitment-copilot/src/lib/start/studio/resumes.functions.ts`
- 对应 server-function focused test

在一次 `resolveWorkspaceAccessFromRequest` 结果上同时检查：

```ts
hasPermissionInStatements(access.permissions, "page", "resumes");
workspaceAccessHasPermission({
  access,
  resource: "resumeLibrary",
  action: "read",
});
```

任一失败均保持现有不可枚举语义，返回 `status: "not_found"`。这里不能从客户端接收
`allowed`、workspace id 或 permission snapshot；可信 workspace id 仍来自服务端 access
结果。

### 2.3 删除 resumes 子 route 的串行重复检查

仅在 2.2 已有测试保护后修改：

- `apps/ai-recruitment-copilot/src/routes/w.$slug.studio.resumes.tsx`

删除 loader 中先执行的 `requireStudioPageAccess(...)`，直接启动
`loadStudioResumesState(...)`。保留它对 `unauthenticated` redirect 和 `not_found` 的现有
处理。

`requireStudioPageAccess` 仍被其他 routes 使用，不在本提交删除或重构该 helper。

### 2.4 测试和验收

至少覆盖：

- Studio layout：父 snapshot 允许时通过，`page:resumes` 不允许时 not-found。
- resumes server function：
  - page 和 resource 都允许时加载数据；
  - page 禁止、resource 允许时不加载数据并返回 not-found；
  - page 允许、resource 禁止时不加载数据并返回 not-found；
  - unauthenticated/not-found workspace 语义不变。
- resumes route：不再先调用独立 page-access server function。
- Network/服务端 trace：Agent → Studio list 的 workspace access 解析由最多 4 次降为 2 次。

预期剩余的 2 次分别是：

1. workspace 父 route 为 layout/provider 生成权限快照；
2. resumes 数据 server function 在独立可信边界重新授权。

不要把父 snapshot 传给第 2 次调用来追求“1 次”，那会把客户端数据变成授权依据。

## 阶段 3：把非关键 Studio 数据改为 Query 驱动的局部 Suspense

### 为什么优先采用 TanStack Query 模式

项目已经：

- 在 Router context 中注入 `queryClient`：
  `apps/ai-recruitment-copilot/src/router.tsx:17`
- 使用 `@tanstack/react-router-ssr-query` 做 Router/Query SSR 集成：
  `apps/ai-recruitment-copilot/src/router.tsx:2`
- 在多处 Start server helper 中使用 `queryClient.prefetchQuery`。

TanStack Router 官方对外部数据层的 deferred 模式是：

1. loader 对关键 query 使用 `await queryClient.ensureQueryData(...)`。
2. loader 对慢且非关键 query 调用但不等待 `queryClient.prefetchQuery(...)`。
3. 组件通过 `useSuspenseQuery(...)` 读取。
4. 在非关键子树附近放置局部 `<Suspense>` fallback。

来源：

- [TanStack Router Deferred Data Loading：External libraries](https://tanstack.com/router/latest/docs/guide/deferred-data-loading#deferred-data-loading-with-external-libraries)
- [TanStack Router + TanStack Query integration](https://tanstack.com/router/latest/docs/integrations/query)
- [TanStack Query Prefetching & Router Integration](https://tanstack.com/query/latest/docs/framework/react/guides/prefetching#router-integration)
- [TanStack Query Suspense guide](https://tanstack.com/query/latest/docs/framework/react/guides/suspense)

相比在 loader response 中自行传递 Promise，这种方式能继续由 Query 管理缓存、freshness、去重和 hydration。

### 数据分类

每个 Studio 首屏数据只能归入一种：

1. **访问关键数据**：权限、workspace identity、决定 redirect/not-found 的数据。必须等待。
2. **首屏结构关键数据**：没有它就无法正确决定页面主体结构或主要列表的数据。默认等待 `ensureQueryData`。
3. **非关键增强数据**：metrics、图表、辅助摘要、次级建议等。启动 `prefetchQuery`，不等待，交给局部 Suspense。
4. **交互后数据**：对话框、展开区、不可见 tab 才需要的数据。不要在导航关键路径预取。

不要把全部列表都延迟，换来一个“框架先出现但用户无法完成主要任务”的假快体验。第一轮优先延迟 metrics、图表等不影响列表浏览和主要操作的区域。

### 招聘台首个 pilot 的具体边界

第一轮只迁移招聘台 metrics，主列表第一页仍是关键数据。

#### 3.1 先停止嵌套路由的无用 metrics

为 resumes loader state 明确区分 list 和 nested 两种 ready 结果，避免使用一个
“永远带 metrics”的宽类型：

```ts
type StudioResumesReadyState =
  | { status: "ready"; mode: "list"; dehydratedState: JsonValue }
  | { status: "ready"; mode: "nested" };
```

进入 `$recordId` 时：

- 不 prefetch 父列表；
- 不执行 `loadResumeLibraryMetrics`；
- 父 route 直接渲染 `<Outlet />`。

更新 `resumes.server.test.ts`，把当前“nested route 仍调用 metrics”的断言反转为
`not.toHaveBeenCalled()`。这一小步应独立测量，即使暂不启用 Suspense也能消除确定浪费。

#### 3.2 把 metrics 建成独立、受双重授权保护的查询

需要新增一个浏览器可调用的数据边界。按照本项目 JSON endpoint 约定，优先在 resumes
Hono read router 中增加 typed `GET /metrics`：

- `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/read-route.ts`
- `apps/ai-recruitment-copilot/src/lib/client/api/endpoints/studio-resumes.ts`

路由必须声明在 `GET /:id` 之前，并同时要求：

- `requirePermission("page", "resumes")`
- `requirePermission("resumeLibrary", "read")`

handler 从 request workspace context 取得 organization id，调用现有
`loadResumeLibraryMetrics`，显式 `c.json(metrics, 200)`。客户端通过现有 typed Hono RPC +
`rpcFetch` 暴露 `fetchStudioResumeMetrics(slug)`。

建立稳定 query key，例如：

```ts
["studio-resumes", slug, "metrics"];
```

client `useSuspenseQuery` 先使用该 key。若后续实施 3.4 的 loader prefetch，服务端与
客户端必须共享 key 与 freshness 约定；但 SSR/Start loader 不能直接使用
browser-relative RPC singleton，届时应改用两端都能调用的 Start server function。

#### 3.3 pilot 先保留主列表的手工 HydrationBoundary

当前 `loadStudioResumesState` 在 server function 内创建临时 QueryClient、等待列表第一页、
`dehydrate()` 后返回 JSON。这个结构虽然不能流式传递 pending metrics，但已经稳定解决了
SSR 主列表 hydration，第一版不要把“列表数据所有权迁移”和“metrics 脱离关键路径”绑在
同一提交。

最小实现：

1. `loadStudioResumesState` 只等待并返回主列表 hydration state，不再返回 metrics。
2. route 保留现有 `HydrationBoundary`，只 hydrate 主列表。
3. `ResumeLibraryMetricsPanel` 首次挂载时通过 `useSuspenseQuery` 调用 typed metrics endpoint。
4. 局部 Suspense 只替换图表区域；route ready 和主列表不等待 metrics。

这会让 metrics 请求比 loader prefetch 晚到组件挂载，但它不会与关键列表争夺导航前半段
的数据库/网络资源，改动范围也更小。先比较“主列表可操作时间”和“图表完成时间”再决定
是否值得提前启动 metrics。

拆分后 metrics endpoint 会形成独立授权请求，因此阶段 2 的“总访问解析 2 次”会变为：

- 导航关键路径仍是 2 次；
- 非关键 metrics 挂载后另有 1 次 Hono workspace/permission 解析。

这是用额外非关键请求换取更短 route critical path 的明确取舍。若数据库 trace 显示额外
授权成本抵消收益，应考虑 request-scoped streaming/server-function 设计，而不是把客户端
权限 snapshot 当作可信输入。

#### 3.4 可选：实测后再提前 prefetch metrics

只有当主列表已经明显变快、但图表 skeleton 停留过久时，再把 metrics 接入
`loaderContext.context.queryClient`：

1. 提供一个 SSR 和浏览器都可调用的 TanStack Start server function 作为 query function；
   browser-relative Hono RPC 不能直接在 SSR loader 中使用。
2. loader 调用 metrics `prefetchQuery` 但不 `await`。
3. 让 `@tanstack/react-router-ssr-query` 负责 pending Query 的 SSR 传递。
4. `useSuspenseQuery` 使用同一个 key、query function 和 freshness。

实现前必须增加 SSR + client-navigation focused integration test，验证：

- SSR 已完成时不会 hydration 后重复请求；
- SSR 仍 pending 时能够被集成层传递/续接；
- 若当前集成版本不能传递 pending query，则退回 Router `<Await>`，不能伪称
  `prefetchQuery` 已 deferred。

#### 3.5 在图表附近建立唯一的数据 Suspense 边界

把 `ResumeLibraryPage` 的 `metrics` prop 移除。新增 feature-owned metrics panel：

```tsx
<Suspense fallback={<Skeleton className="h-48 w-full" />}>
  <ResumeLibraryMetricsPanel slug={slug} />
</Suspense>
```

panel 内使用 `useSuspenseQuery`，成功后再渲染 `ResumeLibraryCharts`。边界只包图表，不包：

- PageHeader
- pipeline tabs
- 主列表
- dialogs
- app/sidebar shell

当前 `ResumeLibraryCharts` 静态导入 Recharts。完成数据 deferred 后再用 bundle/long-task
证据决定是否把 chart panel 改为 `React.lazy`；自动 route splitting 只提供 route 级边界，
不会自动把同一 route component graph 中的 Recharts 单独拆出。若拆包，复用同一个
固定高度 fallback，不嵌套两个视觉 skeleton。

#### 3.6 metrics 错误与 freshness

- metrics 失败不应让主列表 route 失败；在局部 Query error boundary 中提供重试。
- 权限 401/403/404 不显示伪造的零指标。
- 默认先沿用项目 QueryClient 的 `staleTime: 30s`，避免导航/焦点立即重复三条聚合查询。
- 简历创建、删除、pipeline/outcome 变更成功后，同时 invalidate 列表 key 和 metrics key。
- 不给权限 snapshot 增加长 stale time；权限 mutation 后仍需 invalidate Router。

### 局部 Suspense 边界

推荐结构：

```tsx
<StudioPageFrame>
  <CriticalToolbar />
  <CriticalPrimaryList />
  <Suspense fallback={<MetricsSkeleton />}>
    <MetricsPanel />
  </Suspense>
</StudioPageFrame>
```

边界要求：

- app sidebar、top tabs、page header 等稳定 chrome 保持在 Suspense 外。
- 每个 fallback 尺寸接近最终内容，避免 layout shift。
- 不相关的慢区域使用独立边界，避免一个慢 query 阻塞所有增强内容。
- Query 错误交给相邻 error boundary；loading fallback 不能兼任错误提示。
- 需要在参数变化时明确显示新内容 fallback 的边界，应根据语义使用稳定 `key`；React 官方说明 Transition 会尽量保留已展示内容，而不同实体导航可能需要 key 来重置边界。来源：
  [React Suspense：Resetting Suspense boundaries on navigation](https://react.dev/reference/react/Suspense#resetting-suspense-boundaries-on-navigation)

React 还指出，首次挂载前 suspend 的树不会保留 state，而会在资源就绪后重新尝试渲染。因此不要把保存本地输入、展开状态或复杂动画状态的 sidebar shell 放进可能首次 suspend 的边界。来源：

- [React Suspense caveats](https://react.dev/reference/react/Suspense#caveats)

### 不使用 Query 时的备选

若某个一次性 loader 数据不适合进入 Query cache，可以返回未等待 Promise，通过 Router `<Await>` 或 React 19 `use()` 解包。`Await` 会触发最近的 Suspense boundary，reject 则抛给最近的 error boundary。来源：

- [TanStack Router Deferred Data Loading：Await](https://tanstack.com/router/latest/docs/guide/deferred-data-loading#deferred-data-loading-with-await)
- `node_modules/.pnpm/@tanstack+react-router@1.170.17_react-dom@19.2.7_react@19.2.7__react@19.2.7/node_modules/@tanstack/react-router/src/awaited.tsx:11`

同一数据不要同时进入 loader Promise 和 Query cache，避免双重数据所有权。

### 验证

- 非关键慢 query 不再延迟 route ready。
- SSR 输出和 hydration 无重复请求、无 mismatch。
- 首屏主任务数据仍在目标区域出现时可用。
- 每个局部 fallback 只在真实等待时出现。
- query reject 显示局部或 route error UI，不造成空白页面。
- warm cache 导航不强制展示 skeleton；无真实 suspend 时跳过 fallback 属于正确行为。

## 阶段 4：复用 Router pending 状态提供即时反馈

如果 tab 点击后的反馈仍不足，使用 Router 已有导航状态，而不是新建第二套 `useTransition().isPending`。

当前 React adapter 汇总 `isLoading`、内部 `isTransitioning` 和 pending matches：

- `node_modules/.pnpm/@tanstack+react-router@1.170.17_react-dom@19.2.7_react@19.2.7__react@19.2.7/node_modules/@tanstack/react-router/src/Transitioner.tsx:13`

实现原则：

- 目标 tab 可以显示轻微 opacity/progress/pending indicator。
- 不禁用整个 tab list；React Transition 的价值之一就是用户能立即改变主意并发起另一导航。来源：
  [React `useTransition`：Perform non-blocking updates](https://react.dev/reference/react/useTransition#perform-non-blocking-updates-with-actions)
- 不把 pending 反馈做成与现有 sidebar slot 动画竞争的位移动画。
- 不同时维护组件本地 pending 和 Router pending，避免结束时机不一致。

验收：

- 点击后 1 帧内有轻量反馈。
- 用户在第一个导航未完成时点击另一个 tab，第二次交互立即响应。
- 导航失败或 redirect 后 pending 状态能自动清除。
- 不引入 tabs 宽度变化或 sidebar 抖动。

## 阶段 5：按 Profiler 结果隔离隐藏 sidebar slot

只在前四阶段后仍有明显长 commit 时实施。

检查隐藏 slot 是否在 tab 切换同一时刻执行：

- 大列表重新渲染。
- query refetch 与轮询恢复。
- 大量派生计算。
- 同步状态清理。
- 高成本 layout/animation effect。

可选措施按风险排序：

1. 非 active 时暂停轮询或不可见 query，但保留 cache。
2. 切回时先展示 cache，再 background refetch。
3. 把高成本派生内容下沉到 active 子树。
4. 只有在确认不破坏退出动画和状态保留后，才考虑卸载隐藏 slot。

本阶段不默认使用 `startTransition` 包裹所有 query/refetch。Transition 只能降低 React 状态更新优先级，不能减少请求和计算；应先消除不必要工作。

## 实施顺序与提交边界

建议拆成可独立验证的提交：

### 提交 1：tabs intent preload

- 新增 manual `preloadRoute`。
- 增加 pointer/focus/touch 与导航测试。
- 不改 loader、不改 Suspense、不调 pending 阈值。

### 提交 2：Studio 阻塞链去重

- 明确访问控制责任与请求内上下文复用。
- 增加权限与 loader 回归测试。
- 不改变页面 loading 结构。

### 提交 3：第一个非关键数据局部 Suspense

- 只选择一个可量化的慢区域，例如 metrics。
- 增加受 page + resource 双重授权保护的 metrics endpoint 和稳定 query key。
- 主列表 route 不再等待 metrics；第一版由局部 panel 挂载后发起 query。
- 子组件使用 `useSuspenseQuery` 和局部 skeleton。
- 只有图表完成时间实测过慢时，才增加 loader 侧 pending-query prefetch。

### 提交 4：导航 pending 反馈

- 仅在前面优化后仍有必要时增加。
- 复用 Router 状态。

### 提交 5：隐藏 slot 隔离

- 只处理 Profiler 已证明的热点。
- 保留既有协调动画。

每个提交都应有独立的 before/after 证据，避免一次变更多种加载策略后无法判断收益来源。

## 整体验收标准

功能：

- Agent / Studio 路由目标、history、返回行为不变。
- 键盘、鼠标、触摸均可切换。
- 权限、redirect、not-found 和错误处理不变。
- sidebar 现有协调动画与 reduced-motion 行为不变。

性能：

- intent 后点击的冷导航能命中已启动的 route chunk/loader。
- Studio 阻塞请求数量或串行深度下降。
- 非关键慢数据不再阻塞 route ready。
- React 最长 commit 不恶化；隐藏 slot 优化需证明 commit duration 改善。

视觉：

- 热导航不强制闪 skeleton。
- 旧页面不会被整个 app shell fallback 替换。
- 局部 fallback 无明显 layout shift。
- pending indicator 不改变 tab 尺寸。

验证命令建议：

```bash
pnpm --filter @arc/ai-recruitment-copilot exec vitest run <focused-test-files>
pnpm --filter @arc/ai-recruitment-copilot typecheck
pnpm check
git diff --check
```

浏览器验证至少保留：

- React Profiler before/after 截图或导出。
- Network waterfall before/after。
- 冷缓存与热缓存导航测量。
- 鼠标、键盘、触屏/模拟触屏的 tab 行为。

## 决策摘要

| 问题                                | 决策                                        | 理由                                                  |
| ----------------------------------- | ------------------------------------------- | ----------------------------------------------------- |
| tabs 点击是否手写 `startTransition` | 否                                          | 当前 TanStack Router 已内置 React Transition          |
| 第一项实现                          | manual `router.preloadRoute()`              | tabs 不是 `Link`，未自动获得 Link intent preload      |
| 是否立即改 pending 阈值             | 否                                          | 当前已是较积极的 `350ms / 300ms`；阈值只影响 fallback |
| 是否手写 route `React.lazy`         | 否                                          | 当前 Start plugin 已安装 route code splitter          |
| 非关键数据如何延迟                  | 先移出 route await，局部 `useSuspenseQuery` | 先缩短关键路径；实测需要时再做 loader prefetch        |
| Suspense 放在哪里                   | 慢的非关键子树附近                          | 保留稳定 shell，避免整页回退                          |
| pending 状态从哪里取                | Router 状态                                 | 避免第二套 transition 生命周期                        |
| 隐藏 slots 是否卸载                 | 默认否                                      | 先保留状态和现有协调退出动画，仅按 Profiler 证据处理  |

## 第一方资料索引

- [React `useTransition`](https://react.dev/reference/react/useTransition)
- [React `Suspense`](https://react.dev/reference/react/Suspense)
- [TanStack Router Preloading](https://tanstack.com/router/latest/docs/guide/preloading)
- [TanStack Router Data Loading](https://tanstack.com/router/latest/docs/guide/data-loading)
- [TanStack Router Deferred Data Loading](https://tanstack.com/router/latest/docs/guide/deferred-data-loading)
- [TanStack Router Code Splitting](https://tanstack.com/router/latest/docs/guide/code-splitting)
- [TanStack Router Automatic Code Splitting](https://tanstack.com/router/latest/docs/guide/automatic-code-splitting)
- [TanStack Router + TanStack Query integration](https://tanstack.com/router/latest/docs/integrations/query)
- [TanStack Query Prefetching & Router Integration](https://tanstack.com/query/latest/docs/framework/react/guides/prefetching#router-integration)
- [TanStack Query Suspense](https://tanstack.com/query/latest/docs/framework/react/guides/suspense)
