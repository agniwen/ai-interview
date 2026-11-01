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

## 2026-09-18 发布后修复验证（尚未发布）

- Web/API：补齐候选人材料链接及候选人会议入口的日志令牌脱敏，保留可用于排障的路由名称。
- Worker：音轨完整但启停时间覆盖不同的情况，改为提示需核对录音；真实缺失音轨仍提示录音不完整。保留原来的恢复时间段，不放宽缺口判断。镜像构建必须通过生产产物检查，拒绝缺少入口或依赖源码工作区的产物。
- Agent：并发退出共同等待同一个排空任务；入口在排空中被取消时，保持回调连接可用直到排空结束，再传播取消。关闭音频流与字幕推送、移除监听器并断开采集器后，再回调完成。连接或 ready 回调失败也执行清理。没有修改 AI 面试入口。

上述运行链路的本地验证共 69 项通过：Agent 26 项、Server 回调及隔离测试库集成 27 项、日志脱敏 6 项、Worker 录音处理及生产构建 10 项。Server/Worker 类型检查、修改文件格式与 lint 检查通过。隔离测试库使用独立测试 schema，未重跑生产候选人分析或发送业务消息。

新增的 Agent 测试覆盖三人采集、麦克风重新发布、并发退出、入口重复取消、ready 失败和 finish 回调失败保留恢复数据。测试中的识别服务与业务回调使用替身，不等同于多人真实客户端、长会议、弱网和生产滚动发布验收。

`unknown FFI handle` 的线上根因尚未证实。已修复复现的退出竞态并调整资源释放顺序；发布后仍须核对新实例的会议结束日志，不能仅凭本地通过就宣告该 SDK 告警消失。本批改动无需新增数据库迁移，需要后续更新 Web/API、Worker、Agent 才能在生产生效。

## 补充：提前入会与会议有效期

候选人、面试官及工作区内入会入口统一允许预约时间前 15 分钟进入。候选人仍须先确认参加；前端的按钮解锁、服务端检查和后续生成的飞书日程提示同步更新。采集器等待双方到场的预算从 5 分钟延长到 20 分钟，覆盖提前入会和额外 5 分钟的等待。此调整无需数据库迁移，需要更新 Web/API 和 Agent；已发送的飞书日程描述不会自动重写。

“有效时间至”限制新入会及重连，不是正常进行中会议的强制结束时间。双方已到场并建立的会议不会因到期自动挂断；始终未能建立的会议，到期后由后台标记为“未召开”。正常会议由主动结束或房间结束触发后续处理。未指定有效时间至时，系统默认预约时间后一小时。

入会窗口调整的 20 项相关测试通过，覆盖开放前一毫秒、恰好提前 15 分钟、窗口内授权和飞书日程提示；Server/Web 类型检查通过。尚未发布。
