# Hono 大型应用代码组织实践调研

查阅日期：2026-08-31

范围：Hono 官方文档，以及 OpenStatus、Midday、Kaneo 三个仍在更新的开源项目在本次查阅提交中的实际代码。只把仓库源码作为证据，不采用博客、课程或脚手架宣传文案。本文讨论代码组织和依赖边界，不比较框架吞吐。

## 结论先行

**社区里有可借鉴的实践，但没有 NestJS Module 那样由 Hono 官方定义的“企业级目录结构”。** Hono 官方明确强调灵活性；对大型应用给出的核心机制是用独立子应用和 `app.route()` 组合路由，并建议把 handler 留在路径定义处，避免抽成丢失路径类型推导的 Rails 风格 Controller。确实需要拆 handler 时，官方提供 `factory.createHandlers()` 保持类型推导。[Hono 官方 Best Practices](https://github.com/honojs/website/blob/b12c1b0a55a5e47cec286730da428e73547451c0/docs/guides/best-practices.md#building-a-larger-application)

从生产项目源码中反复出现、且适合本仓库的组合是：

1. 根 `app.ts` 只负责全局 middleware、错误处理和挂载。
2. 按业务能力做垂直模块，而不是建立全局 `controllers/`、`services/`、`repositories/`。
3. Hono handler 只做请求校验、鉴权上下文提取、调用用例、映射 HTTP 响应。
4. 业务动作是无 Hono `Context` 的普通函数；显式接收 actor/workspace、输入和依赖或事务，因此 HTTP、Worker、定时任务可以复用。
5. 用 lint/import restriction 和测试强制边界；目录约定本身不会阻止千行路由和跨层导入。

对 `ai-interview` 而言，建议继续 Hono，但把当前“route-owned DAO + 大 route”升级成**垂直模块 + application verbs + 明确 composition root**。这比模仿 NestJS 的全局 Controller/Service 目录更适合当前 Hono RPC、BullMQ Worker 和独立后端运行方式。

## 官方边界：Hono 只解决路由组合，不替项目设计应用层

Hono 官方的大型应用示例是每个资源创建一个独立 `Hono` 子应用，然后由入口用 `app.route("/authors", authors)`、`app.route("/books", books)` 挂载；使用 Hono RPC 时，子路由和根路由都需要链式注册，导出最终路由树的 `typeof`。[大型应用与 RPC 组合](https://github.com/honojs/website/blob/b12c1b0a55a5e47cec286730da428e73547451c0/docs/guides/best-practices.md#building-a-larger-application) 这能解决文件拆分和类型组合，但官方没有规定 application service、transaction、repository 或模块可见性，因此这些边界仍需项目自己建立。

官方还明确记录了 RPC 的扩展性代价：路由越多，`tsserver` 需要执行的类型实例化越多，IDE 会变慢。官方首推编译出客户端类型；也建议将 app/client 按子应用拆分，从而避免一次实例化整棵路由树。[Hono RPC IDE performance](https://github.com/honojs/website/blob/b12c1b0a55a5e47cec286730da428e73547451c0/docs/guides/rpc.md#ide-performance)

因此，`app.route()` 是必要的 transport 组织手段，却不是完整的“大型项目架构”。判断一个社区案例是否值得采用，应继续检查：handler 是否直接编排 DB/队列/外部服务、Worker 是否能调用同一业务动作、跨模块 import 是否受自动化约束。

## 代表案例一：OpenStatus——最接近可执行的模块边界

OpenStatus 把 workspace 范围内的 mutation 放到独立的 `packages/services`。它公开写明：router 只校验输入、调用一个 verb、映射错误；每个业务动作一个文件，统一签名为 `{ ctx: ServiceContext; input }`，其中 `ctx` 携带 workspace、actor 和可选 DB/transaction。[OpenStatus service 规则](https://github.com/openstatusHQ/openstatus/blob/aef03254300f8e884053af3d2e0aad7ef22f5701/packages/services/AGENTS.md#shape-of-a-verb)

实际的 `createMonitor` 也遵循该形式：先执行 scope 检查和输入解析，再通过可复用事务包装器进行额度检查、写入和 audit，整个函数不依赖 Hono `Context`。[`createMonitor` 实现](https://github.com/openstatusHQ/openstatus/blob/aef03254300f8e884053af3d2e0aad7ef22f5701/packages/services/src/monitor/create.ts) ConnectRPC/Hono transport 则在 adapter 中把请求上下文转换为 `ServiceContext`，并把领域错误转换成 transport 错误。[RPC adapter](https://github.com/openstatusHQ/openstatus/blob/aef03254300f8e884053af3d2e0aad7ef22f5701/apps/server/src/routes/rpc/adapter.ts)

最值得借鉴的是规则可执行：服务层通过 Oxlint 配置禁止 Node 内建依赖，并启用自定义 `services-mutation-guards` 规则；该规则检查打开事务的动作是否包含权限检查与 audit 调用，同时源码坦承它只是 guard，行为仍由测试兜底。[Oxlint 配置](https://github.com/openstatusHQ/openstatus/blob/aef03254300f8e884053af3d2e0aad7ef22f5701/oxlint.config.ts#L115-L130) [自定义 lint 规则与限制](https://github.com/openstatusHQ/openstatus/blob/aef03254300f8e884053af3d2e0aad7ef22f5701/scripts/oxlint-plugin-openstatus.js#L1-L12)

这个案例也给出一个重要反例：其旧 V1 `POST /monitor` handler 仍直接执行额度判断、Drizzle 查询、输入转换和写入，说明仅仅把每个 endpoint 拆成文件并不能建立应用边界。[旧 V1 handler](https://github.com/openstatusHQ/openstatus/blob/aef03254300f8e884053af3d2e0aad7ef22f5701/apps/server/src/routes/v1/monitors/post.ts) OpenStatus 自己也在 V1 router 中注明这些 inline Drizzle route 正在迁移到 services。[V1 router 迁移说明](https://github.com/openstatusHQ/openstatus/blob/aef03254300f8e884053af3d2e0aad7ef22f5701/apps/server/src/routes/v1/index.ts#L112-L118)

**适用本仓库的部分：** `ServiceContext` 不必照搬名字，但 `workspace/actor/requestId/transaction` 的显式上下文、每个业务动作一个函数、Worker 和 HTTP 共用动作、lint 强制 import 方向，都直接适用于简历解析、语义索引、面试启动和通知发送。

## 代表案例二：Midday——Hono 做组合层，DB 能力作为独立包

Midday 的 Hono 入口集中处理日志、安全 header、CORS、健康检查、OpenAPI、tRPC 挂载和全局错误，再把 REST 路由树整体挂到根路径。[Midday API 入口](https://github.com/midday-ai/midday/blob/51587319f26a0ffaa9dfccab1920373cb65689b7/apps/api/src/index.ts) REST 聚合器再清楚地区分 public route 和 protected route，并按资源挂载 `customers`、`invoices`、`transactions` 等子应用。[REST router composition](https://github.com/midday-ai/midday/blob/51587319f26a0ffaa9dfccab1920373cb65689b7/apps/api/src/rest/routers/index.ts)

Midday 用 Hono `Variables` 承载 request-scoped `db`、session、teamId、scopes 和 user；middleware 将 DB 放入 Context，资源 handler 取出这些值后调用独立 `@midday/db/queries` 函数。[Context 类型](https://github.com/midday-ai/midday/blob/51587319f26a0ffaa9dfccab1920373cb65689b7/apps/api/src/rest/types.ts) [DB middleware](https://github.com/midday-ai/midday/blob/51587319f26a0ffaa9dfccab1920373cb65689b7/apps/api/src/rest/middleware/db.ts) [Customer router](https://github.com/midday-ai/midday/blob/51587319f26a0ffaa9dfccab1920373cb65689b7/apps/api/src/rest/routers/customers.ts)

这个模式适合 request-scoped 基础设施，但不应把 Hono Context 继续传进业务层。Midday 的 router 仍可能同时承担 OpenAPI contract 和多个 endpoint 的编排；例如 `invoices.ts` 在该提交中仍是一个较大的单文件资源 router，其代码结构本身可以看到大量 route definition 与 handler 共存。[Invoice router](https://github.com/midday-ai/midday/blob/51587319f26a0ffaa9dfccab1920373cb65689b7/apps/api/src/rest/routers/invoices.ts) 因此更稳妥的做法是：Context 只存在于 transport 边界，进入 application function 时转换为最小显式参数。

**适用本仓库的部分：** 保留现有 `Env`/middleware 注入 request context；handler 不把 `c` 传给 DAO/use case，而是抽取 `workspaceId`、actor 和输入后调用普通函数。数据库 primitive 可以共享，但业务用例仍按拥有它的业务模块组织，避免建立一个无限膨胀的全局 queries 包。

## 代表案例三：Kaneo——垂直切片有效，但文件夹不能代替边界

Kaneo 按 `task/`、`project/`、`billing/` 等业务能力组织，每个目录通常包含 `index.ts`、`schema.ts`、`response.ts` 和按动作拆开的 `controllers/`；根应用用 `.route()` 链式挂载这些业务 router。[根路由组合](https://github.com/usekaneo/kaneo/blob/22e7da2db1c41b9449f4768000bf1504e0d343be/apps/api/src/index.ts#L572-L611) 其 `create-task.ts` 并不是接收 Hono Context 的 Rails Controller，而是接收业务参数、执行数据库事务并发布事件的普通函数；route handler 负责读取已校验参数和用户上下文，再调用该函数。[`createTask` action](https://github.com/usekaneo/kaneo/blob/22e7da2db1c41b9449f4768000bf1504e0d343be/apps/api/src/task/controllers/create-task.ts) [Task route 调用 action](https://github.com/usekaneo/kaneo/blob/22e7da2db1c41b9449f4768000bf1504e0d343be/apps/api/src/task/index.ts#L720-L747)

它同时说明垂直切片仍可能失控：同一个 `task/index.ts` 继续集中大量 route contract，而且某些 handler 直接查询 DB、调用 S3 helper。[Task router 直接编排 DB/S3](https://github.com/usekaneo/kaneo/blob/22e7da2db1c41b9449f4768000bf1504e0d343be/apps/api/src/task/index.ts#L749-L780) 所以“业务目录 + controller 文件”只能提升可发现性；若没有 route 薄化指标和依赖限制，仍会重新长出大文件。

**适用本仓库的部分：** 可采用一动作一文件，但不要采用 `controller` 这个容易混淆的命名；本项目更适合 `application/create-resume.ts`、`application/delete-resume.ts` 等。Hono route definition 保留 inline handler，以符合官方类型推导建议；application function 不接收 Hono `Context`。

## 对 ai-interview 的具体落地建议

本仓库的根 [`app.ts`](../../apps/server/src/server/app.ts) 已经接近正确的 mount-only composition root；问题集中在业务 route 内部。当前最大几个 route 分别达到 1028、886、793 行，其中 [`resumes/route.ts`](../../apps/server/src/server/routes/studio/routes/resumes/route.ts) 已显式关闭 `max-lines`。这说明下一步不需要重写根路由，而需要把业务编排从 route boundary 中抽走。

建议先用 `resumes` 做一个受控试点：

```text
resumes/
├── route.ts                    # 只挂载 collection/item/child routers
├── schema.ts                   # HTTP 输入输出 contract
├── application/
│   ├── context.ts              # actor/workspace/requestId/transaction
│   ├── create-resume.ts
│   ├── update-resume.ts
│   ├── delete-resume.ts
│   └── request-resume-parse.ts
├── dao/                        # 由 application 调用的持久化能力
├── adapters/                   # S3、队列、语义索引等实现
└── routes/                     # 真正的 URL 子资源 router
```

这不是要求一次性移动现有全部代码。最小迁移顺序是：

1. 先选一个同时被 HTTP 与 Worker 触发的动作，定义无 Hono 依赖的 application function。
2. Hono handler 只保留 validator、上下文转换和显式状态码；Worker 改为调用同一个 function，不再 import route-local DAO。
3. 为 application function 传入明确的 dependencies/ports；默认依赖只在 composition 文件组装，测试传 fake。
4. 添加 import restriction：`application/**` 禁止导入 Hono，Worker 禁止导入 `routes/**/dao`，跨业务模块禁止访问对方内部 DAO。
5. 对 mutation 增加行为级架构检查，例如事务、workspace scope、幂等或 audit 规则；lint 是 guard，集成测试才验证行为。
6. 按业务域拆分或预编译 Hono RPC 客户端类型；不要让前端编辑器持续实例化完整后端路由树。[Hono RPC 官方缓解建议](https://github.com/honojs/website/blob/b12c1b0a55a5e47cec286730da428e73547451c0/docs/guides/rpc.md#compile-your-code-before-using-it-recommended)

## 不建议照搬的做法

- **全局 `controllers/services/repositories`：** 会把业务所有权重新打平；三个社区案例中更稳定的组织单位都是资源或业务能力，而不是技术层。
- **把 Hono `Context` 传到底层：** 会让 Worker、测试和未来其他 transport 被 HTTP 框架绑住；OpenStatus 的显式 `ServiceContext` 是更好的复用边界。
- **仅靠拆文件解决大模块：** OpenStatus 旧 V1、Midday 大资源 router 和 Kaneo `task/index.ts` 都表明，文件数量增加不等于职责减少。
- **自行造重量级 DI container：** 当前问题需要的是显式 dependencies 和 composition root；单纯复制 NestJS provider ceremony 不会自动建立数据所有权。
- **全仓一次性重构：** 应以一个跨 HTTP/Worker 的动作验证可测试性、import 方向和 RPC 类型成本，再逐模块迁移。

## 最终判断

Hono 社区中最值得采用的不是某个目录模板，而是 **OpenStatus 式的框架无关业务 verbs 与自动化边界、Midday 式的薄入口和 request context、Kaneo 式的业务垂直切片**。三者组合后，Hono 足以保持大型应用可维护；如果只采用 `app.route()` 和更多文件夹，不建立 application boundary 与 lint/test 约束，代码仍会继续松散。
