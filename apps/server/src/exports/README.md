# exports

`@app/server` 对外的唯一实现入口。`package.json.exports` 只声明两个出口：

| 出口            | 文件               | 消费方   | 内容                                                                         |
| --------------- | ------------------ | -------- | ---------------------------------------------------------------------------- |
| `./rpc-client`  | `../rpc-client.ts` | Web      | Hono RPC 客户端类型与 `hcWithType`                                           |
| `./web/runtime` | `web/runtime.ts`   | Web 宿主 | 环境变量契约，以及懒加载的 `createServerApp`、健康检查、飞书机器人、文档同步 |

## 边界

- `web/runtime.ts` 只能静态导入环境变量契约，其余能力必须在函数内部动态 import。这样 Web 在启动早期就能读取环境变量，而不会提前加载整个后端。`tests/package-boundary.test.ts` 会检查这一点。
- Worker 不依赖 `@app/server`。Server 和 Worker 都需要的业务流程放进 `packages/*`（参见 `packages/README.md`），不要在这里新增出口。
