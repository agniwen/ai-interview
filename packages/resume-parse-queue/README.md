# @app/resume-parse-queue

简历后台任务的 Redis/BullMQ 队列契约与 producer 包，覆盖解析、评估生成、语义索引和邮件导入触发。

## 职责与边界

- `resume-parse.ts`：解析任务与队列状态。
- `resume-review-generation.ts`：评估生成任务。
- `resume-semantic-index.ts`：语义索引任务。
- `mail-ingest-trigger.ts`：邮件简历导入触发任务。
- `queue-order.ts`：跨任务优先级/顺序约束。
- 本包不执行解析、评估或数据库 mutation；实际处理在 `@app/resume-processing` 与 Worker。

## 如何修改或新增

1. payload 只包含可序列化、稳定的标识和快照；不要放连接、File 实例或闭包。
2. 字段变化需兼容已排队 job，必要时添加显式 version。
3. 新任务明确 jobId/去重、priority、retry/backoff、remove-on-complete/fail 策略。
4. 同时修改 producer、Worker consumer、readiness/queue stats 和测试。
5. 新模块通过 `package.json.exports` 的 `./*` 暴露，调用方不得导入 `src/` 深路径。

```bash
bun run --filter @app/resume-parse-queue typecheck
bun run --filter @app/resume-parse-queue test
```
