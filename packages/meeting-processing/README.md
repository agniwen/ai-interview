# @app/meeting-processing

可被 Server 与 Worker 复用的会议处理应用层，负责转写、会议智能、清理、搜索投影和人工面试录音评估的完整业务流程。

## 公开入口

- `./transcription`：转写 provider、DAO ports 和转写流程。
- `./intelligence`：会议摘要/智能生成和持久化协调。
- `./purge`：会议产物清理与审计流程。
- `./human-interview`：人工面试录音处理与评估。

## 职责与边界

- 用显式依赖/DAO port 表达完整业务动作，供 HTTP、Worker 或脚本复用。
- 协调 `@app/meeting-media`、AI runtime、queue 和数据库端口。
- 不包含 Hono Context、Worker 进程启动、Web UI 或 Electron 采集代码。
- queue payload 属于 `@app/meeting-processing-queue`；共享产品响应属于 `@app/shared`。

## 如何修改或新增

- 新增流程先选择现有领域入口；只有形成独立领域时才增加新的 package export。
- 数据库行为通过明确 DAO/transaction dependency 注入，不在模块顶层创建连接。
- provider adapter 与应用状态机分离，测试用 focused fake 验证业务结果和失败原因。
- 多步 mutation 要明确事务、post-commit side effect、幂等和重放语义。
- 修改公开结果或错误契约时同步 Server route、Worker consumer 和相关 queue 测试。

```bash
bun run --filter @app/meeting-processing typecheck
bun run --filter @app/meeting-processing test
```
