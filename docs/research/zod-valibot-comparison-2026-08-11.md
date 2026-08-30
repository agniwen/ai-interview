# Zod、Valibot 与替代方案调研

查阅日期：2026-08-11

范围：基于本仓库当前代码，以及 Zod、Valibot、Hono、Vercel AI SDK、Drizzle、ArkType、TypeBox、Typia、Effect 的官方文档、官方仓库和一方 benchmark。没有使用第三方博客或聚合 benchmark；厂商自测数字只用于说明量级，不视为本项目实测。

## 结论先行

**不建议把本项目整体从 Zod 迁移到 Valibot。** 本项目已经在用 Zod 4.4.3，而 Valibot 官方给出的结论也是：Valibot 与 Zod 4 的运行时校验性能大致相近。整体迁移不会带来可信的后端吞吐收益，却会改写大量 schema、错误处理和框架适配代码。

**Valibot 的明确优势是浏览器、Edge 和短生命周期进程中的体积与启动成本。** 官方的同一登录表单示例中，普通 Zod 为 17.7 kB（esbuild）/ 15.18 kB（Rolldown），Zod Mini 为 6.88/3.94 kB，Valibot 为 1.37 kB。这个结果是 schema 与 bundler 特定值，不能直接等价为本项目总包体会下降多少。[Valibot 官方对比](https://valibot.dev/guides/comparison/) Zod 自己用 Rollup + gzip 测一个最小 boolean schema时，Zod 4 为 5.36 kB、Zod Mini 为 1.88 kB；Zod 也解释了常规 method API 难以 tree-shake。[Zod 4 官方发布说明](https://zod.dev/v4?id=introducing-zod-mini)

建议采用三段式策略：

1. **现有 schema 保持 Zod 4。** 尤其是共享领域模型、Mastra/AI 输出 schema、复杂 `superRefine`/错误路径、动态 `ZodType` 构造，以及依赖 Zod 实例或内部结构的 UI。
2. **先量后改。** 用 production bundle analyzer 找出进入浏览器 initial/route chunk 的 Zod schema；只在可证明影响 LCP/交互或 Edge cold start 的叶子边界做 Valibot spike。
3. **新建、低耦合、bundle-sensitive 的表单或 Edge schema 可以优先试 Valibot。** 消费端尽量接收 Standard Schema，而不是直接依赖 Zod/Valibot 类型。若只想降低体积，`zod/mini` 是生态兼容性更高的中间方案，但它同样需要从 chain API 改为 functional API。

## 本仓库现状与迁移半径

本地静态扫描结果：

- 152 个 TypeScript/TSX 源文件直接从 `zod` 引入；排除常见测试路径后仍有 149 个。
- 53 个后端路由模块直接使用 `@hono/zod-validator`。
- 直接使用主要分布为：backend 95 个文件、`packages/shared` 16 个、web 16 个、`packages/db-schema` 13 个、meeting queue 5 个、desktop 4 个、resume queue 3 个。
- 至少 111 个文件使用了需要逐项核对语义的 API/模式，例如 `ZodType`/`ZodTypeAny`、`ZodIssueCode`、`ZodError`、`refine`/`superRefine`、transform/default/catch 和对象 strictness。
- workspace catalog 已固定 `zod: ^4.4.3`。[pnpm-workspace.yaml](../../pnpm-workspace.yaml)
- Web 的 vendored Mastra Studio 另外固定 `zod3: npm:zod@3.25.76`，并包含读取 Zod v3/v4 内部结构的 auto-form compatibility provider。[package.json](../../apps/web/package.json) [compat.ts](../../apps/web/src/components/features/mastra-studio/upstream/lib/form/zod-provider/compat.ts)

因此，“把业务 schema 换完”也不会自动让 Zod 从依赖图或浏览器产物消失。AI SDK、Mastra、现有 Hono adapter 和 vendored Studio 仍可能保留 Zod；必须以最终 chunk diff，而不是 `package.json` 是否还存在 Zod，判断收益。

## 大小会怎么变化

### 单个前端 schema

Valibot 是完全模块化的 functional API，未使用的 schema/action 更容易被 tree-shaking。官方称最小起点低于 700 B；真实登录表单示例为 1.37 kB。[Valibot 简介](https://valibot.dev/) [Valibot 官方对比](https://valibot.dev/guides/comparison/)

与常规 Zod 4 相比，**一个独立、简单、能被正常 tree-shake 的客户端表单 schema，常见量级可以少约 10–16 kB**，即官方示例中的约 90%。与 Zod Mini 相比，官方示例仍小约 2.6–5.5 kB。不能把这个差额乘以 schema 数量：多个 schema 会共享 runtime，重复逻辑也会被 bundler 合并。

本次还用本仓库当前版本和同一个小型对象 schema 做了本地 esbuild 0.28.0 对比：Zod 4.4.3 为 19,518 B gzip、Zod Mini 为 5,302 B、Valibot 1.4.2 为 1,968 B。它与官方结论方向一致，但仍只是隔离示例，不代表本项目 route chunk 的最终净变化。

### 本项目整体

可能出现三种结果：

- **客户端叶子路由**：如果某 route chunk 只因一个共享 schema 拉入常规 Zod runtime，改成 Valibot 可能得到接近官方示例的明显压缩收益。
- **Mastra Studio 等重型 route**：Zod 3/4 compatibility、auto-form 和上游依赖仍会把 Zod 带入，迁移少量 schema 可能几乎没有净收益。
- **后端常驻 Hono 服务**：传输包体不面向浏览器，且请求主要成本通常在 DB、AI/语音 Provider 与网络；少几十 kB 很难形成用户可见收益。Valibot 自己的 Edge 实验也明确说明，bundle 对比不是直接 cold-start 测量，长生命周期服务的收益很小。[Valibot Edge 实验与限制](https://valibot.dev/blog/dependency-size-and-cold-starts/)

所以需要比较 `before/after` 的 production client route chunks、SSR/worker artifact gzip 大小和 cold-start p95/p99；不能只引用库主页数字。

## 性能会怎么变化

### 运行时校验

对本项目最可靠的预期是：**Zod 4 → Valibot 通常不会产生数量级提升。** Valibot 官方把自己定位在运行时性能中游，称大致比 Zod 3 快约 2 倍、与 Zod 4/Zod Mini 相近，但远慢于会生成或 JIT 编译 validator 的 Typia、TypeBox。[Valibot 官方性能说明](https://valibot.dev/guides/comparison/)

Zod 4 官方相对 Zod 3 的自测为 string 约 14.7 倍、array 约 7.4 倍、object 约 6.5 倍；这只能说明当前项目已经吃到 Zod 4 的大部分升级红利，不能拿来证明 Zod 4 比 Valibot 快或慢。[Zod 4 benchmark](https://zod.dev/v4)

同一轮本地微基准进一步说明了结果对数据和错误语义高度敏感：对一个包含 email、整数和枚举数组的小对象，50 万次有效 `safeParse` 约为 Zod 56.7 ms、Valibot 100.9 ms；50 万次三个字段均无效的输入约为 Zod 3,628.8 ms、Valibot 180.6 ms。该测试没有隔离 JIT、GC 与错误对象构造，不应当作库排名；它只说明必须分别测有效/无效数据，并对齐错误收集策略。

对于本项目，大多数校验对象是请求体、配置、DB JSON 或 LLM 结构化输出，validation 通常不是 AI/DB 请求的主耗时。只有 transcript、大批简历或高频 queue payload 的 profiling 证明 validation 是热点时，才值得用真实 schema 做 `tinybench`/生产采样；若目标真是极致 runtime throughput，应该同时测 ArkType、TypeBox compiled 或 Typia，而不只是 Valibot。

### 启动与冷启动

Valibot 更小、schema 初始化工作更少，因此浏览器 TTI、Edge isolate 和短任务启动更可能受益。[Valibot 官方性能说明](https://valibot.dev/guides/comparison/) 但冷启动还受整个 dependency graph、模块数量、平台 isolate 复用和 DB/SDK 初始化影响，不能从 gzip 大小直接推导延迟。

### TypeScript / IDE 性能

没有找到 Valibot 1.x 与 Zod 4.4 的一方、同版本、同 schema 的可信 typecheck benchmark，因此不应承诺切换后 `tsc` 会更快。Zod 4 已经针对泛型爆炸重写：官方的 `.extend()` 示例从 Zod 3 的约 25,000 次 type instantiation 降至约 175 次，并建议对象 spread 获得更好的 typecheck 表现。[Zod 4 TypeScript benchmark](https://zod.dev/v4?id=100x-reduction-in-tsc-instantiations)

本项目应该以 `pnpm typecheck` 的 `--extendedDiagnostics`、编辑器 completion 延迟和真实复杂 schema 为准。大量 codemod 生成的深层 `v.pipe(...)` 也未必天然优于当前 Zod 4。

## Valibot 做不了、或没有 Zod 同等级一等支持的能力

Valibot 已覆盖常见 primitive/object/tuple/record/union/variant/intersection/lazy、Map/Set、Date/File/Blob、Promise、function args/returns、同步/异步校验、transform、brand/flavor、metadata 和 i18n。[Valibot schema 目录](https://valibot.dev/guides/schemas/) [Valibot API](https://valibot.dev/api/) 因为有 `custom<T>` 和 transform，笼统说“Valibot 不能验证某种值”通常不准确。真正差异在一等 API、可逆性和生态协议：

| 能力                             | Zod                                                                                                                        | Valibot                                                                                                                                                                                                                                                                  | 对本项目的意义                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 双向 codec                       | `z.codec()` 原生区分 input/output，支持 `decode`、`encode`、async 与 codec inversion。[Zod Codecs](https://zod.dev/codecs) | 当前 API 有单向 parse/transform/JSON parse/stringify action，但没有等价的通用 `codec` + `encode` 协议。[Valibot API](https://valibot.dev/api/)                                                                                                                           | 若未来希望一份 schema 同时负责 wire ↔ domain 双向转换，Zod 更完整。当前仓库尚未大量使用 codec，所以不是即时 blocker。 |
| JSON Schema                      | Zod 4 原生 `toJSONSchema`，并提供 experimental `fromJSONSchema`。[Zod JSON Schema](https://zod.dev/json-schema)            | 需要独立 `@valibot/to-json-schema`；官方明确说 Valibot 并非围绕 JSON Schema 设计，只有相当一部分 schema/action 可转换。[Valibot JSON Schema](https://valibot.dev/guides/json-schema/)                                                                                    | LLM structured output、OpenAPI 和跨语言 contract 必须逐个验证可转换性。                                               |
| coercion                         | `z.coerce.*` 是内置快捷入口。                                                                                              | 官方刻意不提供同名 API；要求声明输入 schema，再 transform，安全性更显式。[迁移指南](https://valibot.dev/guides/migrate-from-zod/)                                                                                                                                        | 本仓库约 30 处 `z.coerce`，不能纯替换名称。                                                                           |
| 错误定制                         | Zod error model 与 `ZodError`/issue code 生态成熟，可在调用点 `instanceof ZodError`。                                      | schema/action 边界通常只接收一个 message，错误类型/path 结构不同；可用 `forward`/`rawCheck`，但要重写 catch 与前端错误映射。[迁移指南](https://valibot.dev/guides/migrate-from-zod/)                                                                                     | 本仓库使用 `ZodIssueCode`、`RefinementCtx`、`ZodError` 与自定义 path，是主要迁移风险。                                |
| 对象未知键语义                   | `.strict()`/`.passthrough()`/`.catchall()` 等 chain API。                                                                  | 分成 `object`、`strictObject`、`looseObject`、`objectWithRest`。[迁移指南](https://valibot.dev/guides/migrate-from-zod/)                                                                                                                                                 | 必须为每个 request/DB payload 做行为回归，避免静默 strip/accept/throw 改变。                                          |
| ecosystem-specific schema typing | 许多库仍直接声明 `ZodType`、读取 Zod AST 或只为 Zod 提供 helper。                                                          | Standard Schema 能覆盖“validate + infer”，但不能自动覆盖 JSON Schema、metadata、error config、AST introspection。Valibot 也指出通过 Standard Schema 调用时不能传 `abortEarly`、`lang` 等自定义 config。[Valibot 集成指南](https://valibot.dev/guides/integrate-valibot/) | vendored Mastra Studio 的 Zod AST 读取无法用 Standard Schema 替代。                                                   |

## 生态与本项目主要集成

- **Hono**：官方提供 Standard Schema validator，可让 Zod、Valibot、ArkType 共存；也可以使用 Valibot 专用 middleware。[Hono validation](https://hono.dev/docs/guides/validation) 但本项目 53 个 `zValidator` 调用仍需迁移 import、error hook 与 inferred RPC type，不能认为零成本。
- **TanStack Router**：`validateSearch` 接收 parse-capable schema/function，官方明确允许 Zod、Valibot 或 ArkType。[TanStack Router search params](https://tanstack.com/router/latest/docs/guide/search-params)
- **Vercel AI SDK**：Zod 可以直接传；Valibot 需要 `@ai-sdk/valibot` 的 `valibotSchema()` 包装成 AI SDK schema。[AI SDK schema 支持](https://ai-sdk.dev/docs/foundations/tools) [valibotSchema](https://ai-sdk.dev/docs/reference/ai-sdk-core/valibot-schema) recursive/reference 和 Provider strict JSON Schema 行为要单测。
- **Drizzle 1 RC**：当前官方同时提供 `drizzle-orm/zod`、`drizzle-orm/valibot`、TypeBox、ArkType 和 Effect Schema integration。[Drizzle v1 validator consolidation](https://orm.drizzle.team/docs/v0-v1-changes) 因此 Drizzle 不是 blocker。
- **Mastra / Studio**：当前 dependency graph 和 vendored UI 明显依赖 Zod schema/type/AST；即使较新的 Mastra 核心开始用 Standard Schema normalization，Studio auto-form 的 schema introspection 仍是 Zod-specific。本项目不应把它纳入第一批迁移。
- **表单**：本项目已有一个自定义 `StandardSchemaLike` 边界，[entity-form.ts](../../apps/web/src/components/features/studio/entity-form.ts) 说明增量共存是可行方向；但候选表单必须先核对错误 path 和默认值语义。

Zod 官方 ecosystem 仍明显更广，覆盖大量 form、RPC、OpenAPI、ORM、codegen 和 mocking 工具。[Zod ecosystem](https://zod.dev/ecosystem) Valibot 的官方 ecosystem 已包括 Hono、Drizzle、Better Auth、Vercel AI SDK、TanStack Form、React Hook Form 等，足以支持新项目或受控增量采用，但“有 adapter”不等于现有 Zod-specific 调用无需重写。[Valibot ecosystem](https://valibot.dev/guides/ecosystem/)

## 与几个主要竞品的差异

| 方案              | 核心取向                                                  | 体积/性能形态                                                                                        | 主要优势                                                                                                                                                                | 主要代价                                                                                                                            | 对本项目建议                                                                 |
| ----------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Zod 4**         | method chaining、生态/DX 优先                             | runtime 与 Valibot 大致同档；常规包更难 tree-shake                                                   | 现有代码零迁移；AI/表单/OpenAPI 生态最成熟；native JSON Schema 与 codec                                                                                                 | 客户端基础体积较高                                                                                                                  | **默认继续使用**                                                             |
| **Zod Mini**      | Zod 语义的 functional/tree-shakable 版本                  | 官方最小 gzip 1.88 kB；登录示例仍大于 Valibot                                                        | 仍属于 Zod 4 package/core，生态迁移风险低于换 vendor                                                                                                                    | 不是 chain API drop-in；仍需改 schema 写法                                                                                          | bundle-sensitive 新代码的第一备选                                            |
| **Valibot**       | 小函数、pipeline、最大化 tree-shaking                     | 客户端/Edge 启动最有优势；runtime 约等于 Zod 4                                                       | 极小、零依赖、功能覆盖广、Standard Schema                                                                                                                               | 错误/对象/coercion 语义迁移；JSON Schema 与 ecosystem 深度略弱                                                                      | **只增量试点，不整体替换**                                                   |
| **ArkType**       | 接近 TypeScript 的表达式语法、set-theoretic normalization | 预编译优化 validator；官方展示明显快于 Zod 的特定 case，但需项目复测。[ArkType](https://arktype.io/) | schema 简洁、强类型表达、优秀错误；Standard Schema、Hono、Drizzle、JSON Schema integration 完整。[ArkType integrations](https://arktype.io/docs/integrations)           | ESM-only、TS >=5.1；语法和心智模型迁移比 Valibot更大。[ArkType setup](https://arktype.io/docs/intro/setup)                          | 若 profiling 证明 validation 是热点，作为 benchmark 候选；不作为常规迁移目标 |
| **TypeBox 1.x**   | JSON Schema first，TypeScript static inference            | 可选 JIT compiler，官方提供极高吞吐；JIT 受限环境自动回退 dynamic validation                         | schema 本身就是 JSON Schema；适合 OpenAPI/跨语言 contract 与超高频 validation                                                                                           | 1.x 目标 TS 6–7、ESM-only；compiler/JSON-Schema-first DX 与现有 Zod 差距大                                                          | 只用于 JSON Schema first 的独立边界；当前仓库不宜全量换                      |
| **Typia**         | 编译器从纯 TypeScript type 生成 validator/serializer      | 生成专用代码，runtime 通常是此组最快                                                                 | 不重复书写 schema；另有 JSON/LLM/protobuf 生成能力                                                                                                                      | 依赖 transformer/build integration；TanStack/Vite/Turbo/脚本/测试各入口都要验证，动态 schema/custom transform 不如 runtime DSL 直观 | 只在确认的 CPU validation 热点做隔离 spike                                   |
| **Effect Schema** | `Schema<Type, Encoded, Requirements>` 与 Effect 生态      | 功能丰富，不以最小独立表单 bundle 为第一目标                                                         | 双向 encode/decode、typed errors/context、JSON Schema、pretty/equivalence/arbitrary 等模型完整。[Effect Schema](https://www.effect.website/docs/v3/schema/introduction) | 学习和架构引入成本最高；仅为替代 Zod 会过度设计                                                                                     | 除非项目整体采用 Effect，否则不选                                            |

TypeBox 的 JSON Schema/JIT 定位和自测数据见[官方仓库](https://github.com/sinclairzx81/typebox#schema)。Typia 的 transformer 原理与生成后 validator 示例见[官方仓库](https://github.com/samchon/typia)。这些 vendor benchmark 运行环境、数据形状和错误收集模式不同，不能横向拼表得出本项目排名。

## 建议的试点与验收条件

### 第一阶段：只测，不迁移

1. 对当前 production build 生成 client route chunk 与 SSR/worker chunk 报告，记录 raw/gzip/brotli；确认哪些 Zod runtime 真正进入用户关键路径。
2. 选择 3 个真实 schema：小型登录/筛选表单、复杂 `superRefine` 的业务 schema、批量 transcript/resume payload。
3. 对 Zod 4、Zod Mini、Valibot 运行同一组有效/无效/错误收集 benchmark，并单独测 schema 初始化。保证同样的 `abortEarly`、错误数量、transform 和 unknown-key 语义，否则数字不可比。
4. 用 `tsc --extendedDiagnostics` 比较真实 schema，不使用 hello-world 推断整个 monorepo。

### 第二阶段：一个叶子模块试点

优先选满足以下全部条件的模块：

- schema 会进入客户端或 Edge 关键 chunk；
- 不被 Mastra Studio、AI SDK structured output、Zod AST introspection 或共享 backend domain schema消费；
- 无复杂 `ZodIssueCode`/`RefinementCtx`/`instanceof ZodError`；
- 有完整 valid/invalid、错误 path、default/coerce/transform、unknown key 行为测试。

先运行官方 codemod dry-run：

```bash
npx @valibot/zod-to-valibot 'path/to/candidate/**/*' --dry
```

官方明确标注 codemod 仍是 beta，可能漏掉 edge cases，不能直接全仓应用。[Valibot 迁移指南](https://valibot.dev/guides/migrate-from-zod/)

### 继续/停止门槛

只有同时满足以下条件才扩大迁移：

- 目标关键 chunk 的 gzip/brotli 有可复现、对用户指标有意义的下降；
- schema 行为、Hono inferred client type、AI JSON Schema 和中文错误展示全部保持；
- typecheck/editor latency 不退化；
- Zod 能从该 chunk 真正消失，而不是被其他依赖重新带回。

若没有这些结果，保持 Zod 4。对这个项目而言，**schema 一致性、Hono RPC 类型推导、AI structured output 和迁移正确性，比理论上的十几 kB 单库差额更重要**。
