# 招聘台候选人详情覆盖式导航方案

查阅日期：2026-08-23

范围：基于本仓库当前 TanStack Start / TanStack Router 代码，以及 TanStack Router 官方文档、官方示例与官方源码。本文只制定方案，不修改业务代码。

## 结论先行

**可以做到，而且 TanStack Router 的官方 `route masking` 正好覆盖这个场景。**

建议保留现在可直接访问的候选人详情地址：

```text
/w/$slug/studio/resumes/$recordId
```

再增加一个只用于招聘台内打开的实际路由：

```text
/w/$slug/studio/resumes/overlay/$recordId
```

从招聘台点击候选人时，Router 实际匹配 `overlay` 路由，让它在招聘台父路由的 `<Outlet />` 中覆盖 content 区域；但通过 route mask，让地址栏显示现有详情 URL。TanStack Router 官方把“实际进入 modal/overlay 路由，但把 URL 显示成可分享的详情路由”列为 route masking 的标准用途，并说明复制或在新标签打开后会自动按显示出来的 URL 重新匹配。[TanStack Router：Route Masking](https://tanstack.com/router/latest/docs/guide/route-masking)

同时必须在这条 mask 上设置：

```ts
unmaskOnReload: true;
```

官方文档明确说明，route mask **默认会在本机刷新后继续保留**；只有开启 `unmaskOnReload`，刷新时才会放弃运行时 overlay 路由，改为匹配地址栏中的完整详情页。这一点直接决定“刷新后表现和目前一致”能否成立。[TanStack Router：Unmasking on page reload](https://tanstack.com/router/latest/docs/guide/route-masking#unmasking-on-page-reload)

## 本仓库现状

当前 Web 端直接依赖 `@tanstack/react-router 1.170.17` 和 `@tanstack/react-start 1.168.27`，已具备 `createRouteMask`、`routeMasks`、`mask` 与 `unmaskOnReload`，无需为了本功能升级依赖。[Web package.json](../../apps/ai-recruitment-copilot/package.json)

当前路由关系是：

```text
/w/$slug/studio/resumes
└── /w/$slug/studio/resumes/$recordId
```

- `w.$slug.studio.resumes.tsx` 已经是父路由，并负责招聘台权限 loader；没有子详情时渲染 `ResumeLibraryPage`，进入详情子路由时改为只渲染 `<Outlet />`。[当前招聘台父路由](../../apps/ai-recruitment-copilot/src/routes/w.$slug.studio.resumes.tsx)
- `w.$slug.studio.resumes.$recordId.tsx` 已经实现完整候选人详情页、loading、操作弹窗和返回逻辑，因此不需要重新做一套详情 UI。[当前候选人详情路由](../../apps/ai-recruitment-copilot/src/routes/w.$slug.studio.resumes.$recordId.tsx)
- 候选人卡片目前通过 `useNavigate` 进入完整详情 URL。[当前列表导航动作](../../apps/ai-recruitment-copilot/src/components/features/studio/resumes/use-resume-library-page-actions.ts)
- 详情页已经读取 `fromRecruiterResumeList`，并在该状态存在且 history 可后退时调用 `router.history.back()`；但当前列表导航没有写入这个状态。实施时应把这条链路接完整，而不是再增加第二套返回协议。[当前候选人详情路由](../../apps/ai-recruitment-copilot/src/routes/w.$slug.studio.resumes.$recordId.tsx)

TanStack Router 的 nested route 会把父、子路由同时保留在组件树中，子路由由父路由放置的 `<Outlet />` 决定渲染位置。因此 overlay 路由应继续作为 `resumes` 的子路由，让招聘台列表实例保持挂载；不应把详情做成一个脱离 Router 的本地 `open` 布尔状态。[TanStack Router：Outlets](https://tanstack.com/router/latest/docs/guide/outlets) [TanStack Start：Nested Routing](https://tanstack.com/start/latest/docs/framework/react/guide/routing#nested-routing)

## 推荐路由模型

| 场景             | 地址栏 URL                              | Router 实际匹配       | 渲染结果                            |
| ---------------- | --------------------------------------- | --------------------- | ----------------------------------- |
| 正常进入招聘台   | `/w/acme/studio/resumes?...filters`     | `resumes`             | 招聘台列表                          |
| 从卡片点击候选人 | `/w/acme/studio/resumes/123?...filters` | `resumes/overlay/123` | 列表保持挂载，详情覆盖 content 区域 |
| 浏览器返回       | 恢复列表 URL                            | `resumes`             | 移除覆盖层，露出原列表实例          |
| 复制地址到新标签 | `/w/acme/studio/resumes/123?...filters` | `resumes/123`         | 当前完整详情页                      |
| 在覆盖态刷新     | `/w/acme/studio/resumes/123?...filters` | `resumes/123`         | 当前完整详情页                      |
| 直接访问详情 URL | `/w/acme/studio/resumes/123?...filters` | `resumes/123`         | 当前完整详情页                      |

官方实现原理是把实际运行时 location 保存到浏览器 history state 的内部 `__tempLocation`，而地址栏写入 masked location；共享 URL 时没有这份 history state，所以自然匹配地址栏路由。不要在业务代码中读取或写入 `__tempLocation` / `__tempKey`，这些由 Router 管理。[TanStack Router：How does route masking work](https://tanstack.com/router/latest/docs/guide/route-masking#how-does-route-masking-work) 官方源码也显示，Router 在提交 masked location 时把实际 location 写入 history state；启用 `unmaskOnReload` 后用 Router 实例临时 key 判断刷新并解除 mask。[TanStack Router 官方源码：router.ts](https://github.com/TanStack/router/blob/main/packages/router-core/src/router.ts)

## 推荐实现

### 1. 抽出一份共享详情实现

把当前 `w.$slug.studio.resumes.$recordId.tsx` 中的详情 controller、query、操作弹窗和 shell 抽到 feature 目录，例如：

```text
components/features/studio/resumes/recruiter-resume-detail-page.tsx
```

由两个薄路由复用：

- 现有 `$recordId` 路由：`presentation="page"`，保持直接访问时的完整页面表现。
- 新增 `overlay/$recordId` 路由：`presentation="content-overlay"`，使用同一份内容和操作逻辑，只改变承载方式。

这样不会复制 query key、阶段操作、权限判断、编辑弹窗或面试弹窗，也符合仓库“route 模块只做路由边界，feature UI 放在 components/features”的约定。

### 2. 新增招聘台内 overlay 子路由

建议文件：

```text
routes/w.$slug.studio.resumes.overlay.$recordId.tsx
```

它的实际路径是：

```text
/w/$slug/studio/resumes/overlay/$recordId
```

选择静态 `overlay` 段有两个好处：

1. 它仍然是 `resumes` 的子路由，能在父路由 `<Outlet />` 中渲染并保留列表实例。
2. 它不会被现有动态 `$recordId` 路由吞掉；实际路径只存在于 Router 内部，地址栏会被 mask 成现有详情 URL。

该子路由需要自己的 `pendingComponent` 和 `errorComponent`，二者都应在 content 覆盖层内显示，不能让加载或错误状态把整个 Studio shell 替换掉。官方 `<Outlet />` 会在匹配时渲染子路由的 component、pendingComponent 或 errorComponent。[TanStack Router：Outlet component](https://tanstack.com/router/latest/docs/api/router/outletComponent)

### 3. 在 Router 中集中声明 route mask

推荐在 `src/router.tsx` 中使用官方 `createRouteMask`，而不是让每一个卡片调用都手写 `mask`：

```ts
import { createRouteMask, createRouter } from "@tanstack/react-router";

const recruiterResumeOverlayMask = createRouteMask({
  routeTree,
  from: "/w/$slug/studio/resumes/overlay/$recordId",
  to: "/w/$slug/studio/resumes/$recordId",
  params: true,
  search: true,
  unmaskOnReload: true,
});

const router = createRouter({
  // existing options
  routeTree,
  routeMasks: [recruiterResumeOverlayMask],
});
```

`createRouteMask` 是类型安全的；声明式 `routeMasks` 与 `<Link>` / `navigate()` 的命令式 `mask` 都是官方 API。官方 location-masking 示例也把 overlay route 挂在列表 layout 的 `<Outlet />` 下，同时让独立详情 route 负责新标签/分享后的完整页面，并在示例注释中优先建议集中声明 route mask。[TanStack Router：Declarative route masking](https://tanstack.com/router/latest/docs/guide/route-masking#declarative-route-masking) [TanStack Router 官方 location-masking 示例](https://github.com/TanStack/router/blob/main/examples/react/location-masking/src/main.tsx)

这里用 `search: true` 保留招聘台筛选、排序和 `tab` 等 search 参数；用 `params: true` 透传 `slug` 与 `recordId`。地址栏因此仍是一条完整、可复制的详情 URL。

### 4. 让父路由保持稳定的列表层

当前父路由通过 pathname 在“列表”和“Outlet”之间二选一。需要调整为三种匹配结果：

```text
resumes 本身                 -> 列表
resumes/overlay/$recordId    -> 同一个列表实例 + 覆盖层 Outlet
resumes/$recordId            -> 只显示现有完整详情 Outlet
```

列表到 overlay 的前后两次 render 必须保持同一个外层结构和同一个 `ResumeLibraryPage` 节点位置，不能先返回 `<ResumeLibraryPage />`，再切成一个不同根节点的 fragment；否则 React 仍可能卸载列表，失去“原地返回”的主要收益。

覆盖态下，列表可以继续挂载但必须从交互和辅助技术中移除：给背景层设置 `inert` / `aria-hidden`，并阻止 pointer events；详情覆盖层使用实色 `bg-background` 覆盖 content 区域。它是“页面覆盖态”，不是阻塞式 Dialog，因此不建议使用 portal、全屏黑色 backdrop 或 Dialog focus trap。

### 5. 点击、关闭与浏览器历史

卡片点击应改为导航到实际 overlay 路由，并保持默认的 history `push`，不要设置 `replace: true`：

```ts
navigate({
  to: "/w/$slug/studio/resumes/overlay/$recordId",
  params: { slug, recordId: record.id },
  search: nextSearch,
  state: (previous) => ({
    ...previous,
    fromRecruiterResumeList: true,
  }),
  resetScroll: true,
});
```

- 浏览器 Back 会自然 pop 掉 overlay entry，恢复列表 URL。
- 详情页左上角“返回招聘台”继续复用现有逻辑：有 `fromRecruiterResumeList` 且可安全后退时 `router.history.back()`；否则导航到招聘台列表作为兜底。
- 浏览器 Forward 会重新打开覆盖态，这是符合 history 语义的表现。

TanStack Router 的默认 browser history 使用浏览器 History API；`useCanGoBack` / `router.history.back()` 是官方提供的安全返回方式。不过 `useCanGoBack` 当前仍标为 experimental，本仓库已经使用 `router.history.canGoBack()`，无需为了本需求切换 API。[TanStack Router：History Types](https://tanstack.com/router/latest/docs/guide/history-types) [TanStack Router：useCanGoBack](https://tanstack.com/router/latest/docs/api/router/useCanGoBack)

TanStack Router 官方建议对普通可点击导航优先使用 `<Link>`，因为它保留真实 `href`、键盘行为、新标签打开与预加载；`navigate()` 更适合副作用驱动的导航。[TanStack Router：Navigation](https://tanstack.com/router/latest/docs/guide/navigation) 但当前候选人卡片内部还有 checkbox、badge 和多个按钮，不能把整个卡片根节点直接变成 `<a>`，否则会出现嵌套交互元素。建议：

- 候选人姓名改成真实 `<Link>`，目标为 overlay 实际路由。
- 卡片空白区域继续复用现有命中判断后调用 `navigate()`。
- 其他按钮继续阻止冒泡，避免选择、编辑等操作误触发详情导航。

### 6. 滚动与状态保持

由于列表作为父路由内容保持挂载，筛选、选择、virtualizer measurement 和已加载页不需要重新构造；Back 后应直接露出原实例。现有 `scrollRestoration: true` 与 `resetScroll: true` 可以继续负责详情打开时滚到 content 顶部、返回时恢复列表位置。TanStack Router 官方支持对嵌套滚动容器指定 scroll restoration selector，也允许单次导航通过 `resetScroll` 控制是否重置。[TanStack Router：Scroll Restoration](https://tanstack.com/router/latest/docs/guide/scroll-restoration)

仍需保留现有自定义 virtual list snapshot 作为页面级导航和直接详情返回的兜底，但 overlay 返回路径不应再依赖列表重建才能恢复。

## 为什么不推荐其他方案

### 只用本地 Dialog state

它不能天然满足 URL、Back/Forward、直接访问、分享和刷新语义，还会产生“UI 状态一套、路由状态一套”的双重真相。

### 只在 `location.state` 放一个自定义 background location

TanStack Router 的 route masking 已经用 `location.state` 管理实际 location 与显示 location，并为分享和 reload 提供明确规则。业务层再实现一套 `backgroundLocation` 会重复 Router 内部能力，而且 history state 在本机刷新时可以保留，若没有 `unmaskOnReload` 等价逻辑，就无法满足“刷新进入完整详情页”。[TanStack Router：Route Masking internals](https://tanstack.com/router/latest/docs/guide/route-masking#how-does-route-masking-work)

业务自定义 state 只应保留 `fromRecruiterResumeList` 这类“返回策略提示”，不应拿它决定完整页还是覆盖页；渲染模式应由实际匹配到的路由决定。

### 只保留一个详情路由，再根据 history state 改 CSS

这样虽然少一个 route 文件，但完整页和覆盖页仍由同一路由组件手动猜测来源，pending/error/SSR/刷新分支都会纠缠在一起。独立 overlay route + route mask 能让 Router 明确承担状态机：实际 route 决定渲染，masked URL 决定分享后的 fallback。

## 需要验证的验收矩阵

### 路由与 history

1. 带筛选条件的招聘台点击候选人，地址栏变为详情 URL，但列表 query/selection/virtualizer 实例没有卸载。
2. 浏览器 Back 关闭覆盖层并恢复原筛选、原滚动位置；Forward 再次打开覆盖层。
3. 覆盖态点击页面内“返回招聘台”与浏览器 Back 结果一致。
4. 覆盖态刷新后显示现有完整详情页，而不是重新盖在列表上。
5. 复制地址栏到新标签或无 history 的新会话，显示现有完整详情页。
6. 直接访问不存在或无权限的候选人，完整页和覆盖态都走现有 not-found / permission 边界。

### 交互与可访问性

1. 覆盖态不能 tab 到背景列表控件，鼠标也不能点击背景卡片。
2. 候选人姓名保留真实链接语义；卡片内 checkbox、菜单、badge 不误触发详情。
3. 打开后 content 滚动到顶部，返回后招聘台回到原滚动锚点。
4. overlay 的 pending/error 都只占 content 区域，sidebar 和 Studio header 保持稳定。

### 回归

1. 完整详情页的四个 tab、编辑、阶段流转、发起面试、面试详情弹窗全部复用同一实现并保持一致。
2. 手机端建议仍使用完整内容宽度的 page takeover，不改成窄抽屉；浏览器 Back/刷新/分享规则与 PC 一致。
3. 当前日历、搜索结果等其他入口继续直接导航到现有详情 URL，不应被强制变成招聘台 overlay。只有“从招聘台卡片进入”的入口导航到实际 overlay route。

## 建议实施顺序

1. 先把当前详情路由的业务内容抽成可复用 feature component，并用现有详情页测试证明行为未变。
2. 增加 overlay route 与父路由稳定 layer，先验证列表不会卸载、背景不可交互。
3. 在 Router 注册 declarative route mask，并设置 `unmaskOnReload: true`。
4. 把招聘台卡片入口指向 overlay route，补齐 `fromRecruiterResumeList` state；其他详情入口不动。
5. 增加 Router history 测试和真实浏览器四路径验证：点击、Back、刷新、复制新开。

这套改动不需要调整数据库、后端 API 或详情数据 contract；核心风险集中在路由树、history、滚动容器和 overlay 的可访问性。

## 官方资料

- [TanStack Router：Route Masking](https://tanstack.com/router/latest/docs/guide/route-masking)
- [TanStack Router：官方 location-masking 示例](https://github.com/TanStack/router/blob/main/examples/react/location-masking/src/main.tsx)
- [TanStack Router：Router Core 源码](https://github.com/TanStack/router/blob/main/packages/router-core/src/router.ts)
- [TanStack Router：Navigation](https://tanstack.com/router/latest/docs/guide/navigation)
- [TanStack Router：Outlets](https://tanstack.com/router/latest/docs/guide/outlets)
- [TanStack Router：Route Trees](https://tanstack.com/router/latest/docs/routing/route-trees)
- [TanStack Router：Scroll Restoration](https://tanstack.com/router/latest/docs/guide/scroll-restoration)
- [TanStack Start：Routing](https://tanstack.com/start/latest/docs/framework/react/guide/routing)
