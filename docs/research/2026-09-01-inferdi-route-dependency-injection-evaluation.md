# InferDI 在 Server Route 中的适用性评估（2026-09-01）

## 结论

不建议为了替换 `global-config/route.ts` 当前的 `createGlobalConfigRouter(dependencies)` 而引入 InferDI。

当前写法已经是依赖注入：路由工厂显式接收三个有类型的依赖，生产环境使用默认实现，测试直接传入 fake。InferDI 真正增加的是**类型化依赖图、singleton/scoped/transient 生命周期约束、请求作用域和确定性释放**；它不会自动把依赖注入 Hono handler。官方适配器仍然要求 handler 使用 `c.var.di.get(...)`，其源码也明确说明适配器只是生命周期胶水，不提供装饰器、路由扫描或 handler 参数注入。[Hono 官方 InferDI 示例](https://hono.dev/examples/inferdi)、[InferDI Hono adapter 源码](https://github.com/inferdi/inferdi/blob/main/packages/hono/src/index.ts#L1-L22)

因此，在 `global-config` 这个只有两个 DAO 函数和一个权限中间件的简单 CRUD 路由中，直接迁移主要会把显式依赖变为 Service Locator，并为每个请求增加 scope 创建和释放流程，却没有获得实际的 scoped/disposable 资源管理收益。

建议保持现状；若要验证 InferDI，应该选择一个确实存在请求级 actor/org/transaction、可释放资源，或由 HTTP 与 Worker 共同调用的完整 application verb 做单能力试点，而不是全仓迁移。

## InferDI 实际解决什么

InferDI 的核心能力与当前路由工厂并不是同一层问题：

- 容器的泛型类型携带完整依赖图，编译器检查缺失依赖、构造参数顺序和非法生命周期关系。[InferDI 类型与注册说明](https://github.com/inferdi/inferdi#why-inferdi)
- 它区分 `singleton`、`scoped` 和 `transient`；singleton 不能捕获 scoped/transient 依赖，从而防止一个请求的数据泄漏到其他请求。[InferDI Lifetimes](https://inferdi.com/core/lifetime-guards)
- child scope 缓存并释放自己创建的 scoped 实例；root 和 child scope 的释放责任分开。[InferDI Scopes and Disposal](https://inferdi.com/core/scopes)
- `@inferdi/hono` 每次中间件调用创建一个 request scope，把它放进 Hono context variable，并在 `next()` 完成后释放。root container 不由中间件释放。[Hono 官方 InferDI 示例](https://hono.dev/examples/inferdi#options)
- 官方示例明确要求 request data 留在 HTTP 边界，向依赖图提供小型应用上下文，而不是把整个 `Hono.Context` 注入业务代码。[Hono 官方 InferDI 示例](https://hono.dev/examples/inferdi#getting-started)

这对长依赖链、请求级事务、按请求缓存、异步初始化和资源 teardown 有价值；它不负责消除简单函数参数，也不会替代路由声明期的 Hono middleware 组合。

## 与当前 `global-config` 路由的对比

| 维度       | 当前显式 dependency object                                                  | 改为 InferDI                                                                                                                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 依赖可见性 | `GlobalConfigRouterDependencies` 在工厂签名中完整可见                       | handler 从 `c.var.di` 按 token 查找，真实依赖要跳到 container builder 查看                                                                                                                                                                      |
| 测试替换   | 直接构造一个满足接口的 object，无生命周期和解析时序要求                     | `.override()` 有类型，但必须在依赖被 resolve 之前执行；override 只影响当前 container/scope，且 mock 的清理由测试负责。[InferDI Testing and Overrides](https://inferdi.com/core/testing)                                                         |
| 请求作用域 | 当前两个 DAO 调用无请求级实例或释放需求                                     | 每次请求仍会创建和释放一个 scope，但没有 scoped service 可管理                                                                                                                                                                                  |
| 权限中间件 | `requirePermission(...)` 在 route definition 时显式创建，路径与权限关系清楚 | request-time container 不能自动注入 route-definition-time middleware；它仍应保持显式声明                                                                                                                                                        |
| RPC 类型   | 当前 `.get().put()` 链保留完整 Hono schema                                  | 可以保持，但必须继续链式声明；InferDI 只扩展 Hono `Env.Variables`，不会替路由恢复丢失的 RPC 类型。[Hono Testing Helper](https://hono.dev/docs/helpers/testing)、[Hono RPC](https://hono.dev/docs/guides/rpc#using-rpc-with-larger-applications) |
| 运行时代价 | 闭包读取三个函数                                                            | container 注册、request scope、token lookup 和 disposal；对本路由没有对应收益                                                                                                                                                                   |

当前测试 `apps/server/src/server/routes/studio/routes/global-config/__tests__/route.test.ts` 直接传入 fake DAO 和权限 middleware，不接数据库即可覆盖 GET、PUT 和校验失败。InferDI 可以实现同样效果，但不会让这个测试更少或更清楚。

## RPC、运行时与生命周期影响

### Hono RPC

InferDI 本身不会破坏 Hono RPC：它的 Hono 类型只向 `Variables` 增加一个具体 scope，route schema 仍由链式 `.get()`、`.put()`、validator 和 `c.json(..., status)` 决定。[InferDI Hono adapter 类型](https://github.com/inferdi/inferdi/blob/main/packages/hono/src/index.ts#L68-L93)

但采用时仍必须保持本仓库现有的链式 route composition。Hono 官方明确说明，`testClient` 和 RPC 的具体路由类型依赖类型从链式 route method 中流动；先创建 app、再用独立语句注册 handler 会丢失具体 route inference。[Hono Testing Helper](https://hono.dev/docs/helpers/testing#important-note-on-type-inference)

### Bun、Node 与 TanStack-mounted Hono

截至本次核对，`@inferdi/inferdi` 和 `@inferdi/hono` 最新版本均为 `6.0.2`。core 声明 Node `>=16`、Bun `>=1.0`、TypeScript `>=5.2`；Hono adapter 的 peer range 是 Hono `^4.0.0`。本仓库 Bun `1.4.0`、Hono `^4.12.18`、TypeScript `7.0.2` 在声明范围内。[InferDI requirements](https://github.com/inferdi/inferdi#requirements)、[`@inferdi/hono` package metadata](https://github.com/inferdi/inferdi/blob/main/packages/hono/package.json)

适配器只是标准 Hono middleware，所以 standalone Node server 与 TanStack Start 内嵌 Hono 在请求处理层都能使用。真正需要额外设计的是 root container 生命周期：

- Web 入口懒加载并缓存一个 Hono app；如果 root container 创建并拥有连接资源，必须有对应的 Web runtime teardown 方案。
- standalone server 已有 `RuntimeCloseStack`；若容器拥有资源，应把 root disposal 纳入同一关闭流程，不能只依赖 request scope middleware，因为官方明确说明 middleware 不释放 root。
- 当前数据库等基础设施已有外部生命周期所有者时，应注册为 externally-owned value，避免容器和既有 shutdown stack 双重释放。

### Streaming

Hono streaming helper 可能在 stream callback 结束前返回 `Response`。InferDI 官方要求这类 route 调用 `skipInferdiDispose(c)`，再在 stream 自己的 `finally` 中释放 scope；否则 scoped resource 可能提前释放。[Hono 官方 InferDI Streaming](https://hono.dev/examples/inferdi#streaming)

`global-config` 没有 streaming，但本仓库存在 SSE/streaming routes，因此把 InferDI middleware 放到 `/api` 全局祖先会让这些 route 都承担这一迁移约束。这也是应从一个有界 capability 开始，而不是先做全局容器的原因。

## 包体与依赖影响

InferDI 本身很轻：core 无 runtime dependencies，core 和 Hono adapter 都声明 `sideEffects: false`，Hono adapter 只有 InferDI 与 Hono peer dependencies；core 仓库还用脚本强制 minified gzip bundle 小于 3 KiB。[core package metadata](https://github.com/inferdi/inferdi/blob/main/packages/inferdi/package.json)、[Hono adapter package metadata](https://github.com/inferdi/inferdi/blob/main/packages/hono/package.json)、[bundle-size check](https://github.com/inferdi/inferdi/blob/main/packages/inferdi/scripts/check-bundle-size.mjs)

主要 bundle/startup 风险不在库本身，而在项目如何构建 container：若一个全局 builder 为所有 capability 做 eager import/registration，它可能把原本可延迟加载的能力集中到启动图中。应按 capability 组合 container module，并只在真正需要的 runtime 引入。

成熟度方面需要保守：npm 官方元数据显示该包首次发布于 2026-05-02，在约四个月内已经历 1.x 到 6.x。快速演进不代表质量问题，但足以支持“单能力、可回退试点”，不支持直接全仓绑定。[npm registry metadata](https://registry.npmjs.org/@inferdi/inferdi)

## 建议的采用边界

### 现在

保留 `createGlobalConfigRouter(dependencies)`。它的依赖数量少、测试 seam 清晰，也符合仓库当前“显式 dependency object + 小型 factory”的 route 规则。

如果只是觉得默认 dependency object 样板较多，可以在不引入容器的前提下保持默认生产 router，并只对测试导出 factory；不要为了隐藏三行对象初始化引入应用级 service locator。

### 只有满足以下条件时再试点

候选 capability 至少应满足其中两项：

1. 存在真实 request/job-scoped dependency，例如 actor、organization、transaction 或按请求缓存；
2. 存在 singleton/scoped 生命周期错误风险；
3. 存在需要确定性释放的资源；
4. 一个完整 application verb 同时被 HTTP、Worker 或 script 调用；
5. 当前依赖需要跨多层 route factory 手工转发，而不是只注入当前 route 的两三个 leaf function。

### 试点形态

1. 在 composition root 构建一个 root container，而不是在每个 route 创建 container。
2. 在最接近且真正共享 scope 的认证祖先挂一次 `inferdiHono` middleware；先由现有认证 middleware 得到 actor/org，再将最小值作为 scope inputs。
3. 注册完整 application verb/service 及其 declared ports；不要把每个 DAO 函数和每个 Hono middleware 都变成 token。
4. route 继续显式声明 `requirePermission(...)`、validator、status code 和链式 handler；handler 只 resolve 一个窄 application service。
5. 测试每次创建新 root 或在尚未 resolve 的新 scope 上 override；验证 application behavior、HTTP mapping、server typecheck、standalone import 和 Web `rpc.api.*` typecheck。
6. 若试点最终只是把 `dependencies.getGlobalConfig(...)` 改成 `c.var.di.get("getGlobalConfig")(...)`，应删除试点并回到显式依赖对象。

## 最终建议

**不在 `global-config` 引入 InferDI，也不做全局迁移。** InferDI 的设计与运行时兼容性没有明显硬伤，但它解决的是依赖图与生命周期问题，不是 route factory 的语法观感。等出现一个有真实 scope/disposal/跨入口复用价值的 application verb，再做有界试点；试点成功后才决定是否扩大。
