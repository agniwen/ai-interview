# @app/meeting-live-transcript

跨 Desktop、Web 和 Server 的实时会议转写协议与状态处理包，覆盖音频 sidecar、草稿、修正会话、提示词上下文、Qwen 事件和浏览器到服务端 relay。

## 公开入口

- `./browser`：浏览器/渲染端音频与转写协作能力。
- `./server`：服务端 relay 和会话处理能力。
- `./draft`：实时草稿和 turn 聚合。
- `./hints`：转写提示信息构建。
- `./qwen-events`：provider 事件契约与解析。

## 职责与边界

- 保持协议、事件和纯状态机可被多个运行时复用。
- 不拥有 Electron 权限、Hono 路由、数据库 DAO 或最终会议智能分析。
- 浏览器入口不得导入 Node-only 模块；服务端入口不得泄漏到客户端 bundle。
- 持久化字段的 canonical 类型仍在 `@app/db-schema` / `@app/shared`。

## 如何修改或新增

- 协议字段变化必须考虑 Desktop/Web/Server 的滚动升级兼容，并同步所有发送端与接收端测试。
- 浏览器专用能力放 `browser.ts` 或 browser-focused 模块；Node 专用能力只从 `server.ts` 导出。
- 通用 draft/correction 算法放独立纯模块并补顺序、重复事件和断线恢复测试。
- 新增公开能力时显式更新 `package.json.exports`，不要依赖深路径导入。

```bash
bun run --filter @app/meeting-live-transcript typecheck
bun run --filter @app/meeting-live-transcript test
```
