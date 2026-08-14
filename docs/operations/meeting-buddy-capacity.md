# Meeting Buddy 容量与故障运维

Meeting Buddy 的三个主要容量域互相独立：实时字幕同时 100 场、直接上传同时 100 场、最终转录 Worker 并发 20。媒体合成与 Intelligence 使用各自队列和并发值，不占用最终转录的 20 个槽位。

## 运行配置

| 能力         | 配置                                  | 默认值 | 计数方式                                                  |
| ------------ | ------------------------------------- | -----: | --------------------------------------------------------- |
| 实时字幕     | `MEETING_LIVE_TRANSCRIPT_CONCURRENCY` |    100 | PostgreSQL 中未过期的 capture 租约；双轨共用一个名额      |
| 直接上传     | `MEETING_DIRECT_UPLOAD_CONCURRENCY`   |    100 | PostgreSQL 中未过期且由 Desktop 心跳续期的 uploading 租约 |
| 最终转录     | `MEETING_TRANSCRIPTION_CONCURRENCY`   |     20 | BullMQ Worker concurrency                                 |
| 媒体合成     | `MEETING_PLAYBACK_WORKER_CONCURRENCY` |      2 | 独立 BullMQ Worker concurrency                            |
| Intelligence | `MEETING_INTELLIGENCE_CONCURRENCY`    |      4 | 独立 BullMQ Worker concurrency                            |

生产部署必须让所有 Backend 实例连接同一个 PostgreSQL，让所有 Worker 连接同一 Redis queue prefix，并确保数据库连接池、Redis、R2 写入/出口和 provider 账户配额覆盖目标负载。OpenAI 429 会记录为 `provider-quota`；录音保持可用，Owner 可在配额恢复后重试。

上传租约每次签发计划或收到 Desktop 心跳都会延长 121 分钟。该时长覆盖预签 PUT 最晚 60 分钟开始加单次 55 分钟硬超时；即使心跳中断，已授权对象写入也会先结束，之后槽位才会释放。部署迁移会为既有 `uploading` 记录保守回填租约，数据库约束禁止新的活动上传缺失租约。

## 运维端点

Worker 的 `GET /operations/meetings` 需要 `Authorization: Bearer $WORKER_DIAGNOSTICS_SECRET`。响应区分 media finalization、final transcription、Intelligence 的 queue depth/concurrency，并提供：

- live/direct-upload 当前占用；
- save-to-upload、upload-to-transcript 的 24 小时有界样本延迟；
- provider/stage/errorCode 聚合失败、queue retry、purge outcome；
- 有界 stuck-upload、stuck-media-finalization、stuck-final-transcription、stuck-intelligence、failed-purge meeting ID 与 age。

端点和日志不得包含音频、对象键、签名 URL、provider secret、转录文本、Note、候选人内容或原始异常正文。公共 `/healthz` 只返回进程存活；`/readyz` 只返回稳定依赖状态。

## 独立负载验证

只在隔离的测试 Workspace、测试 R2 bucket、测试 Redis prefix 和明确同意使用的短 WebM 样本上运行。不要复用生产 Cookie、候选人录音或 provider key。命令不会打印 Cookie、上传 URL 或 provider secret。

### 100 场直接上传

该模式实际创建 100 场会议、PUT 两条源轨并调用 complete：

```bash
MEETING_LOAD_MODE=upload \
MEETING_LOAD_BASE_URL=https://test.example.com \
MEETING_LOAD_WORKSPACE_SLUG=load-test \
MEETING_LOAD_COOKIE='better-auth.session_token=REDACTED' \
MEETING_LOAD_MICROPHONE_FILE=/absolute/path/microphone.webm \
MEETING_LOAD_SYSTEM_FILE=/absolute/path/system.webm \
pnpm --filter @arc/ai-recruitment-copilot-worker load:meeting-capacity
```

记录 create/PUT/complete 成功率、save-to-upload 延迟、stuck-upload 告警和 R2/数据库资源曲线。

### 20 个最终转录任务

先准备恰好 20 个不同 Meeting、不同 job identity 的已验证任务（JSON 数组，字段必须符合 `meetingTranscriptionJobSchema`），再直接投递最终转录队列：

```bash
MEETING_LOAD_MODE=final \
MEETING_LOAD_BASE_URL=http://127.0.0.1:8788 \
MEETING_LOAD_FINAL_JOBS_FILE=/absolute/path/final-jobs.json \
WORKER_DIAGNOSTICS_SECRET=REDACTED \
pnpm --filter @arc/ai-recruitment-copilot-worker load:meeting-capacity
```

脚本会拒绝重复或已有非终态 job，持续轮询这 20 个 job，只有实际观测到峰值 active=20 且全部到达 completed/failed 才成功；仅看到配置值 20 不算容量证据。同时确认 media finalization 与 Intelligence 的 active/concurrency 没有被改成 20。记录 provider quota、重试、upload-to-transcript 延迟和失败后录音仍可用的证据。

### 100 场实时字幕

下面命令验证应用侧 100 个持久在线租约、授权和 heartbeat；它不建立 WebRTC 媒体连接，因此不能作为 provider 媒体容量证据：

```bash
MEETING_LOAD_MODE=live \
MEETING_LOAD_BASE_URL=https://test.example.com \
MEETING_LOAD_WORKSPACE_SLUG=load-test \
MEETING_LOAD_LIVE_COOKIES_FILE=/absolute/path/100-session-cookies.json \
MEETING_LOAD_DURATION_SECONDS=600 \
pnpm --filter @arc/ai-recruitment-copilot-worker load:meeting-capacity
```

JSON 文件必须恰好包含 100 个不同测试成员的完整 Cookie 字符串。单用户授权有独立的防滥用频控，不能通过提高该限制来伪造 Workspace 并发证据。

发布前还必须用 100 个真实 Desktop capture 建立 OpenAI WebRTC transcription session，持续至少 10 分钟，并记录授权成功率、断线/重连、provider 429、音频 sidecar backpressure 与本地录制完整性。应用租约测试与 provider WebRTC soak 是两份证据，不能相互替代。

## 告警建议

- 任一 `stuck-*` 或 `failed-purge` 持续两个采样周期：告警并使用 meetingId 定位重投/恢复动作；
- final transcription `failed > 0` 或 `provider-quota > 0`：检查 provider 账户区域与分钟/日配额；
- queue waiting 持续增长且 active 达 concurrency：扩 Worker 前先检查 PostgreSQL、R2、Redis 和 provider 配额；
- purge 失败：保留 tombstone/outbox，让 Worker 重试，禁止手工删除数据库行绕过对象清扫。
