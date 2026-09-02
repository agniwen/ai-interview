# @app/worker

AI Hiring Copilot 的后台 Worker 运行时。它消费简历与会议队列、执行定时通知和恢复任务，并提供存活、就绪和受保护的运营诊断端点。

## 职责

- 消费简历解析、评估生成、语义索引和邮件触发任务。
- 消费会议转写、媒体收尾、智能分析、清理和人工面试评估任务。
- 运行面试通知 scheduler、失败恢复和容量相关后台流程。
- 在 `src/app.ts` 提供 `/healthz`、`/readyz` 以及受 Bearer 保护的队列/运营快照。
- 为共享 processing 包组合真实数据库、队列、对象存储、AI provider 和监控依赖。

## 边界

- 可复用业务处理放 `packages/resume-processing` 或 `packages/meeting-processing`；Worker 只做运行时组合和进程生命周期。
- 队列名称、payload 和 producer/consumer 契约归对应 queue 包所有，不能只在 consumer 一侧改字段。
- HTTP 业务 API 属于 `apps/server`；Worker 的 Hono app 只服务健康和运营诊断。
- Worker 不依赖 `apps/web`，也不导入浏览器或 TanStack Start 模块。

## 修改与新增指南

| 需求                | 修改位置                                                              |
| ------------------- | --------------------------------------------------------------------- |
| 新增/修改队列消费者 | `src/` 对应业务目录，并同步修改所属 queue 包契约                      |
| 新增可复用处理流程  | 对应 `packages/*-processing`，Worker 只注入生产依赖                   |
| 新增环境变量        | `src/env.ts` / `src/config.ts`、示例 env 和 readiness 校验同步修改    |
| 新增健康或诊断端点  | `src/app.ts`，运营数据端点必须继续受 `WORKER_DIAGNOSTICS_SECRET` 保护 |
| 新增定时任务        | 独立 scheduler 模块，明确幂等、重试、关闭和可观测性                   |
| 修改数据库访问      | 使用 `@app/database` + `@app/db-schema`，不要自建第二套连接工厂       |

新增任务时必须定义幂等和重试语义，并为 payload、processor 和错误路径写测试。不要在模块 import 时建立重量级外部连接；保持 readiness/实际任务触发时的惰性加载。

## 常用命令

```bash
bun run --filter @app/worker dev
bun run --filter @app/worker typecheck
bun run --filter @app/worker test
bun run --filter @app/worker build
```
