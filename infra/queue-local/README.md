# 本地应用任务队列

独立于 LiveKit 内部 Redis，专供本机 Web 和 Worker 使用。仅监听本机回环地址，启用 AOF 持久化，不驱逐队列键。

```sh
make queue-local-up
make queue-local-status
```

在 `apps/web/.env` 和 `apps/worker/.env` 中设置：

```dotenv
REDIS_URL=redis://127.0.0.1:6380/0
```

修改后须重启 Web 和 Worker；进行中的会议请先结束。独立启动后端时，其环境中的 `REDIS_URL` 也需一致。

`make queue-local-down` 停止容器但保留持久卷，不会清理远端队列，也不会迁移或重新发送历史任务。

## 隔离边界

- 远端 Worker 不能消费本机 Redis 的任务。
- 业务数据库仍沿用应用配置，没有隔离。多个环境的恢复扫描仍可能从同一数据库读取记录，分别入队处理。
- 飞书通知使用数据库通知事件表轮询，不走 Redis；切换 Redis 不会隔离通知发送 Worker。
- 完全独立联调还需隔离业务数据库，或限制恢复和通知调度的工作范围；本配置不修改远端服务。
