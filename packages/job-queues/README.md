# @app/job-queues

后台任务的 Redis/BullMQ 队列契约与 producer，由 Server、Web 宿主和 Worker 共用。每个 `src/<job>.ts` 拥有该任务的队列名、payload schema 与类型、入队函数、consumer 工厂和队列状态原语。

## 任务一览

| 领域 | 模块                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- |
| 简历 | `resume-parse`、`resume-review-generation`、`resume-semantic-index`、`mail-ingest-trigger`、`queue-order`（跨任务优先级与顺序） |
| 会议 | `meeting-transcription`、`meeting-playback`、`meeting-intelligence`、`meeting-answer`、`meeting-purge`                          |
| 面试 | `human-interview-recording`、`human-interview-evaluation`、`initial-interview-evaluation`                                       |

## 职责与边界

- 只定义契约和 producer/consumer 原语，不执行业务处理，也不访问数据库；实际处理在各处理包和 Worker 中。
- Server/Web 用它投递任务、查询队列状态，Worker 用同一份契约消费任务，两边不各自声明字段。
- payload 只放可序列化、稳定的标识和快照，不放连接、`File` 实例或闭包；可复用的业务类型优先放在 `@app/shared`。
- Redis 中的队列名是线上契约，改名会让已排队的任务丢失，除非同时做迁移。

## 如何修改或新增

1. 新任务使用独立、按业务命名的模块，不要做成泛化的 `queue-utils`。
2. 定义稳定的 job name 和可校验的 payload；字段演进要兼容 Redis 中已经排队的旧任务，必要时加显式版本号。
3. 明确 jobId 去重、priority、重试/backoff 和 remove-on-complete/fail 策略，producer 和 consumer 同步修改。
4. 通过 `package.json.exports` 的 `./*` 暴露，调用方不要导入 `src/` 深路径；同时在 Worker 增加处理器，并更新 readiness 和队列统计。
5. 测试至少覆盖入队配置、payload，以及顺序和幂等行为。

```bash
bun run --filter @app/job-queues typecheck
bun run --filter @app/job-queues test
```
