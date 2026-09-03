# 本机 LiveKit 联调

独立的 LiveKit Server、Redis 和两个 Egress 实例；不修改远程 LiveKit。
这是 macOS Docker Desktop 联调配置，不用于生产。两路录音分别是全场音频和候选人音频。

## 前置条件

- Docker Desktop 引擎可用，镜像支持当前机器架构。
- 为 Docker 提供足够的 CPU/内存；LiveKit 官方建议每个 Egress 至少 4 CPU / 4 GB，实际以双路录音验证为准。
- 本地 Web 在 3000 端口运行，Worker 已配置录音 R2 和 AI 服务。
- 将 `.env.example` 复制为本目录 `.env`，填写当前 Mac 局域网 IPv4 和独立开发密钥；`.env` 不提交 Git。

## 启停

从仓库根目录执行：

```sh
make livekit-local-up
make livekit-local-status
make livekit-local-logs
make livekit-local-down
```

`down` 仅停止并移除此 Compose 项目的容器/网络，不删除业务数据库和 R2 文件。
此 Redis 不持久化，只服务于本地媒体会话，重启后需要重新入会。

## 应用切换

基础设施启动并检查通过后，再将 Web 和 Python Agent 的以下配置切换为：

```dotenv
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=<本目录 .env 的 LIVEKIT_LOCAL_API_KEY>
LIVEKIT_API_SECRET=<本目录 .env 的 LIVEKIT_LOCAL_API_SECRET>
AGENT_NAME=giaogiaog
CALLBACK_BASE_URL=http://localhost:3000
```

Web 的 `NEXT_PUBLIC_AGENT_NAME` 保持 `giaogiaog`，并添加 `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=host.docker.internal`，只允许 Docker 宿主机域名。
远程连接的三个原始配置保存在各应用的 `.env.livekit-remote`（忽略 Git，权限 600）。恢复时只替换这三个变量，不覆盖其他配置。
切换后必须完整重启 Web/Agent；仅等待 Vite 热重载可能继续使用进程中的旧密钥。
Worker 无需连接 LiveKit，但必须加载与 Web 一致的 `RECORDING_R2_*` 配置；环境变量改动后应重启 Worker。
`make dev` 启动应用，不会自动启动这套基础设施。

Web 和 Worker 的业务数据库、应用任务 Redis 不会被这套 Compose 替换，现有数据和队列仍可能共享。
这不是完全离线环境：R2、转录、模型和飞书仍需外部服务。不要以为本地 LiveKit 就意味着业务数据也已隔离。

## 网络和回调

- 浏览器和宿主机 Agent 使用 `ws://localhost:7880`；信令/API 只发布到宿主机回环地址。
- 容器内 Egress 使用 `ws://livekit:7880`，不用容器内的 `localhost`。
- LiveKit 回调经 `host.docker.internal:3000/api/livekit/webhook` 到本地 Web，保留 JWT 验签。
- 7881/TCP、7882/UDP 发布在指定 Mac 局域网地址，供媒体连接使用；更换网络后需更新 `LIVEKIT_LOCAL_IP` 并重新创建服务。
- 默认针对同一电脑的两个浏览器测试。其他设备不能使用 `localhost` 入会或打开飞书链接；跨设备测试需另行配置 HTTPS/WSS 和可访问的域名。

## 验收

先在无业务关联的测试房间验证连接、真实 Webhook 投递以及 Egress 连接；不要通过伪造入会事件代替真实验证。
真实面试由测试人员主动启用麦克风：双方入会时间落库 → 两路录音 active → 录音 completed → 转录 ready → 评价 draft → 飞书链接可打开。
“Egress 列表接口可访问”不等于录音服务可用；必须实际验证录音任务和文件。

可复用的测试（只向新建的非业务房间发送合成测试音，不访问麦克风，不写入候选人数据）：

```sh
cd apps/livekit-agent
uv run ../../infra/livekit-local/smoke.py
uv run ../../infra/livekit-local/smoke.py --record --candidate-track
uv run ../../infra/livekit-local/smoke.py --application
```

`--record --candidate-track` 同时检查全场纯音频录音和候选人音轨录音，检查完成状态、文件大小和时长；测试文件保存在录音容器 `/tmp/local-smoke-*.ogg`，不上传 R2。测试后自动关闭自己的房间和录音任务。该测试不代替真实面试的 R2/转录/飞书全流程验收。

`--application` 使用 Web 的 `.env`，调用正式业务录音函数，验证真实 R2 上传及文件存在性。仅允许本地 LiveKit；会在当前录音前缀下的 `human-interviews/local-smoke/` 保存两份约 100 KB 的合成音频，不写业务数据库、不调用 AI、不发送飞书消息。测试文件保留以供检查。

### 当前验证结果与边界（2026-09-02）

- 本地 RTC 连接成功，入会、离会及两路 `egress_ended` 回调均收到本地 Web 的 HTTP 200。
- 使用上述音轨方案，两路 OGG 均完成，分别约 95 KB、5.8 秒；仅使用合成测试音。
- 原业务代码使用 `ParticipantEgress` 输出候选人 OGG，在 Egress v1.14.1 上返回 `no supported codec is compatible with all outputs`。已改为 `TrackCompositeEgress`，只传入候选人的麦克风音轨 ID，双路 OGG 和后续共享处理流程不变。单独执行 `--record`（不加 `--candidate-track`）仍可复现旧请求的问题。
- 正式业务函数实测：`local-smoke-218fcfaafcba` 双路完成并上传 R2，全场 96,425 字节、候选人 96,012 字节，均约 5.9 秒；两路录音完成回调 HTTP 200。
- 麦克风延迟发布会再次触发已有启动重试，已在录音中的会议仍由现有数据库 claim 防止重复启动。
- 本次未替换“录音 → 最终转录 → AI 评价”流程。真实人声、最终转录、评价和飞书需由测试人员新建面试后验收，不能用合成音频测试声称全流程已通过。
- 候选人轨道录制绑定具体音轨 ID。中途退出并重新入会、更换设备造成音轨重建的连续录音拼接不在本次修复范围；本次验证针对双方持续在会的正常流程。

官方文档：

- https://docs.livekit.io/transport/self-hosting/local/
- https://docs.livekit.io/transport/self-hosting/egress/
- https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events/
