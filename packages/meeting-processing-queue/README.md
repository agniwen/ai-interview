# @app/meeting-processing-queue

会议后台任务的 Redis/BullMQ 队列契约与 producer 包，覆盖转写、回放/媒体收尾、智能分析、清理、回答处理和人工面试评估。

## 职责与边界

- 每个 `src/<job>.ts` 拥有该任务的队列名、payload schema/type、入队和队列状态原语。
- Server 用它投递任务，Worker 用同一契约消费和观测任务。
- 本包不执行会议业务处理、不访问数据库，也不拥有 Worker 生命周期。
- 可序列化业务 payload 类型优先复用 `@app/shared`，不能把数据库连接或运行时对象放进 job data。

## 如何修改或新增

1. 新任务使用独立、业务命名的模块，不创建泛化 `queue-utils` 大杂烩。
2. 定义稳定的 job name 和可验证 payload；字段演进需兼容已在 Redis 中排队的旧任务。
3. 明确去重/jobId、重试、backoff 和清理策略，producer 与 consumer 同步实现。
4. 新模块加入 `package.json.exports` 可匹配的路径，并在 Worker 增加处理器。
5. 测试至少覆盖入队配置、payload 和 queue ordering/idempotency 行为。

```bash
bun run --filter @app/meeting-processing-queue typecheck
bun run --filter @app/meeting-processing-queue test
```
