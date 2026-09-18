# 真人面试实时转录发布说明

本次更新复用现有 LiveKit Agent。需要迁移数据库，并更新 Web/API、Worker、LiveKit Agent 三类应用；不需要增加第二套 Agent 服务，也不要求升级 LiveKit Server、Egress、Redis 或 PostgreSQL 版本。Egress 继续提供录音和异常补转来源。

## 更新范围

| 服务                                          | 必须更新的原因                                               |
| --------------------------------------------- | ------------------------------------------------------------ |
| Web/API（`apps/web`，包含 `apps/server`）     | 转录回调、字幕读取、隐藏采集器、评价回填、会议结束与轮次提示 |
| Worker（`apps/worker`）                       | 转录恢复、会议收尾、录音附加、AI 评价与证据复核              |
| 现有 LiveKit Agent（`apps/livekit-agent`）    | 按任务类型分流、逐人实时识别、即时字幕预览、持久化与排空     |
| 独立 API 实例（如果实际部署了 `apps/server`） | 与 Web 内置 API 同步更新，不能保留旧回调实例                 |

仓库根 `docker-compose.yml` 只编排 Web 和 Worker；Agent 按现有部署入口单独更新。三个应用应构建同一提交的镜像。

## 发布顺序

1. 保持 Web/API 的 `HUMAN_INTERVIEW_TRANSCRIPTION_MODE=legacy`，暂不创建使用新模式的会议。
2. 使用生产数据库的迁移配置，从本次代码执行一次 `bun run db:migrate`。此命令读取 `apps/web/drizzle.config.ts`；发布前确认其环境指向目标库，不能使用本地隔离测试配置。执行所有待应用迁移，不要只选择最后一条。
3. 更新全部 Web/API 和 Worker 实例，确认新来源字段和回调均已可用。Web 检查 `/api/ready`，Worker 检查 `/healthz`、`/readyz`。
4. 更新现有 LiveKit Agent 的全部接任务实例，保留原 AI 面试入口，确认注册成功。避免中断正在进行的面试；滚动发布完成前保持 `legacy`。
5. 验证原 AI 面试正常，再在指定测试工作区开启 `shadow` 对照；对照会同时运行旧链路和后台采集，会增加识别用量。
6. 对照验收后，将同一工作区切到 `server_realtime`，创建一场新会议验证。模式在创建会议时保存，修改开关不会改变已有会议。

本次新增的五个迁移目录为：

- `20260918015827_milky_anthem`
- `20260918025909_clear_nuke`
- `20260918032051_petite_matthew_murdock`
- `20260918032315_petite_mister_sinister`
- `20260918033038_spicy_puma`

它们增加实时转录任务、事件、来源与质量字段及约束。迁移已在隔离测试库验证；本次提交和同步不代表生产迁移已经执行。

## 配置

Web/API：

```dotenv
HUMAN_INTERVIEW_TRANSCRIPTION_MODE=legacy
HUMAN_INTERVIEW_TRANSCRIPTION_ORGANIZATIONS=<允许启用的工作区ID，多个用逗号分隔>
HUMAN_TRANSCRIPTION_MAX_MEETINGS=8
```

白名单使用工作区 ID，不是 `light` 等 slug。白名单为空表示所有工作区均可使用选定模式，因此小范围启用时必须填入明确 ID。

Web/API 与 Worker 的 `LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`、`AGENT_NAME` 应一致；Worker 会负责恢复调度。若设置容量上限，也应给 Worker 配置同样的 `HUMAN_TRANSCRIPTION_MAX_MEETINGS`。保持 `WORKER_BACKGROUND_PROCESSING_ENABLED=true`。数据库和 Redis 继续使用各自生产配置。

Agent：

```dotenv
HUMAN_TRANSCRIPTION_OUTBOX_DIR=/app/.data/human-transcription
HUMAN_TRANSCRIPTION_MAX_TRACKS=8
```

- 为上述目录挂载可跨容器重建保留的持久卷，同时保留原报告 outbox。Dockerfile 的 `VOLUME` 声明不能替代部署平台的持久卷配置。
- 容器终止宽限至少 45 秒；代码中的 Agent 进程退出预算为 30 秒。
- 核对既有 `CALLBACK_BASE_URL` 指向生产 Web/API，`AGENT_CALLBACK_SECRET` 与服务端一致；既有 LiveKit、DashScope 凭据继续使用生产配置。
- 不复制本地测试 `.env`：本地测试关闭了消息、飞书和文档同步。生产通知开关保持原来的业务设置；新增 `HUMAN_INTERVIEW_DOCUMENT_SYNC_ENABLED` 默认 `true`，需要同步评价文档时不要设为 `false`。

## 发布验收

创建新会议后确认：只有真人显示在参会列表；每位发言者的字幕持续更新；任务为 `capturing`，心跳正常，无缺口或错误。

结束会议后确认：尾部句段排空，录音停止，房间清理，转录进入 `ready`，AI 评价生成草稿。材料不足可以未评级，最终评级与通过/不通过由面试官提交。录音随后可回听。异常退出测试应保留真人会议与录音，进入恢复流程；重复结束不能跳过排空。

本地业务七面实测：会议结束至 AI 草稿保存约 13.89 秒；这不是生产时限保证。多面试官、长会议、弱网和滚动发布仍需在授权范围验收。当前 SDK 退出时偶发 `unknown FFI handle` 告警，本次实测未影响转录或评价，发布后继续观察。

## 回退

先把 Web/API 的模式改回 `legacy`，阻止新会议继续采用实时模式。已经创建的实时会议仍按自己的模式完成，因此应保留兼容版本的 Web/API、Worker 和 Agent，直到它们结束并完成后续处理。不要直接降级到不认识新字段的旧镜像，也不要删除新增表或历史转录；不完整材料按录音恢复或人工复核处理。
