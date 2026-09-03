# 真人面试线上 LiveKit 配置说明

适用：2026-09-03 检查的当前线上服务器。本文提供操作步骤，尚未在生产执行。

## 1. 当前部署与需要补齐的部分

| 项目                   | 当前值                                  |
| ---------------------- | --------------------------------------- |
| Web 域名               | `https://interview.chainthink.cn`       |
| LiveKit 域名           | `wss://interview-livekit.chainthink.cn` |
| Web 容器               | `ai-tool-demo`，宿主机端口 `3000`       |
| Worker 容器            | `ai-tool-worker`                        |
| LiveKit 容器           | `livekit-server`，使用 host 网络        |
| LiveKit 宿主机配置文件 | `/app/livekit/config.yaml`              |
| LiveKit 容器内配置文件 | `/etc/livekit/config.yaml`              |
| 现有 Compose 文件      | `/app/livekit/docker-compose.yaml`      |
| LiveKit Redis          | `127.0.0.1:6379`，与 LiveKit 同机       |

当前 LiveKit 配置没有 `webhook`，当前主机也没有 Egress 容器。需要配置事件回调，并部署或确认已在其他机器部署的 Egress 录音服务。

两条链路分别验收：

- 实时字幕：浏览器 → Web 的 `/_human-interview-live-transcript` WebSocket → 转录服务。
- 录音与会后处理：LiveKit → Webhook → 启动 Egress → 保存录音 → Worker 转录与评价。

本地联调用 `infra/livekit-local/compose.yml` 同时启动 LiveKit、Redis 和 Egress。容器回调 `http://host.docker.internal:3000/api/livekit/webhook` 到 Mac 上的 Web；线上采用下面的正式域名回调。

## 2. 配置 LiveKit Webhook

先备份配置：

```sh
cp -p /app/livekit/config.yaml "/app/livekit/config.yaml.bak-$(date +%Y%m%d-%H%M%S)"
```

编辑 `/app/livekit/config.yaml`，保留现有 `port`、`keys`、`rtc`、`redis`、`turn` 等内容，在顶层增加：

```yaml
webhook:
  api_key: "<当前线上 LIVEKIT_API_KEY>"
  urls:
    - https://interview.chainthink.cn/api/livekit/webhook
```

`webhook` 与 `keys` 同级。已有 `webhook` 时修改原段落，不要重复添加。

密钥必须对应：

- `webhook.api_key` 使用 LiveKit 现有 `keys` 映射中的一个键名。
- Web 容器 `ai-tool-demo` 的 `LIVEKIT_API_KEY` 必须与它相同。
- Web 的 `LIVEKIT_API_SECRET` 必须等于该键在 LiveKit `keys` 中对应的 Secret。
- YAML 文件里的占位符需换成实际值；不要把 `<...>` 或 `${LIVEKIT_API_KEY}` 原样写入 `config.yaml`。此配置通过文件挂载加载，不能假定 Shell 会展开变量。

回调由 LiveKit 通过 POST 发出，携带 `Authorization` 签名和 `Content-Type: application/webhook+json`。网关应将该路径转发到 Web 的 `/api/livekit/webhook`，保留请求正文与这两个请求头，不添加登录跳转。

下面命令只验证网络和验签入口：

```sh
curl -i --max-time 10 \
  -X POST https://interview.chainthink.cn/api/livekit/webhook \
  -H 'Content-Type: application/webhook+json' \
  --data '{}'
```

没有签名的探测应返回 **401 / Invalid signature**；这是预期结果。真实 LiveKit 事件应返回 200。404 表示路径或转发不正确，500 且提示密钥未配置时检查 Web 环境变量。

确认无人进行面试后应用配置。重启 LiveKit 会影响当前会议连接：

```sh
docker restart livekit-server
docker logs --since 2m livekit-server
```

## 3. 部署 Egress 录音服务

如果已有另一台机器运行 Egress，先核对它连接的是上述 LiveKit 和同一个 Redis；不必重复部署。下面方案适用于当前 Linux 主机，独立 Compose 项目管理 Egress，保留现有 LiveKit/Redis 部署。

新建 `/app/livekit/egress.env`，填入与 LiveKit、Web 相同的一组线上密钥：

```dotenv
LIVEKIT_API_KEY=<当前线上 API Key>
LIVEKIT_API_SECRET=<该 Key 对应的 Secret>
```

设置文件权限：

```sh
chmod 600 /app/livekit/egress.env
```

新建 `/app/livekit/docker-compose.egress.yaml`：

```yaml
services:
  egress:
    image: livekit/egress:v1.14.1
    network_mode: host
    restart: unless-stopped
    cap_add:
      - SYS_ADMIN
    shm_size: 1gb
    deploy:
      replicas: 2
    environment:
      EGRESS_CONFIG_BODY: |
        api_key: ${LIVEKIT_API_KEY:?Set LIVEKIT_API_KEY in egress.env}
        api_secret: ${LIVEKIT_API_SECRET:?Set LIVEKIT_API_SECRET in egress.env}
        ws_url: ws://127.0.0.1:7880
        insecure: true
        redis:
          address: 127.0.0.1:6379
        enable_chrome_sandbox: true
        log_level: info
```

这里的 `127.0.0.1` 依赖 `network_mode: host`，仅用于当前同机部署。跨机器部署时改用 Egress 可达的 LiveKit 地址及同一 Redis 的受控网络地址；Redis 的认证信息与数据库编号也须一致。

`v1.14.1` 是仓库本地联调用过的版本。两个实例用于初始联调，并不表示已验证生产并发容量。Egress 官方建议每个实例至少 4 CPU / 4 GB，需要结合这台同时运行 Web、Worker 等服务的机器评估资源。

验证配置语法并启动：

```sh
docker compose -p ai-interview-egress \
  --env-file /app/livekit/egress.env \
  -f /app/livekit/docker-compose.egress.yaml config --quiet

docker compose -p ai-interview-egress \
  --env-file /app/livekit/egress.env \
  -f /app/livekit/docker-compose.egress.yaml up -d

docker compose -p ai-interview-egress \
  --env-file /app/livekit/egress.env \
  -f /app/livekit/docker-compose.egress.yaml ps

docker compose -p ai-interview-egress \
  --env-file /app/livekit/egress.env \
  -f /app/livekit/docker-compose.egress.yaml logs --since 5m
```

使用 `config --quiet` 避免在终端打印展开后的密钥。当前业务代码在启动 Egress 时传入对象存储配置，无需另在 Egress 中复制一套 R2 配置。

## 4. Web 与 Worker 配置

Web 保持以下正式站点地址，并发布本次字幕来源校验修复：

```dotenv
BETTER_AUTH_URL=https://interview.chainthink.cn
NEXT_PUBLIC_BASE_URL=https://interview.chainthink.cn
LIVEKIT_URL=wss://interview-livekit.chainthink.cn
LIVEKIT_API_KEY=<与 LiveKit 相同>
LIVEKIT_API_SECRET=<与 LiveKit 相同>
ALIBABA_API_KEY=<当前转录服务密钥>
```

本次字幕修复使用 `BETTER_AUTH_URL`，未设置时使用 `NEXT_PUBLIC_BASE_URL`，两者都未设置时才使用请求地址。正式地址同时用于来源校验、字幕授权、租约心跳和释放；Web 容器必须可以访问自身的正式域名。网关保留 WebSocket Upgrade 转发即可，不要通过关闭来源校验解决 403。

Web 和 Worker 的录音存储配置必须指向同一个位置：

```dotenv
RECORDING_R2_BUCKET_NAME=<录音桶>
RECORDING_R2_ACCESS_KEY_ID=<Access Key ID>
RECORDING_R2_SECRET_ACCESS_KEY=<Secret Access Key>
RECORDING_R2_ENDPOINT=<对象存储 S3 API endpoint>
RECORDING_R2_REGION=auto
RECORDING_R2_FORCE_PATH_STYLE=<保持当前存储配置的 true 或 false>
RECORDING_R2_KEY_PREFIX=<保持当前录音前缀>
```

当前检查已确认两个容器都设置了录音桶、访问密钥和 endpoint；不必重新生成或更换现有密钥。修改环境变量后需通过原部署流程重建应用容器，单纯 `docker restart` 不会更新容器创建时注入的环境变量。

## 5. 新建测试会议验收

配置完成后新建一场真人面试，由测试人员主动开启麦克风验证：

1. 双方进入后，Web 收到 `/api/livekit/webhook` 的真实 POST，返回 200；会议从 `scheduled` 变为 `in_progress`，入会信息更新。
2. 发布麦克风音轨后启动 Egress，录音状态从 `pending` / `starting` 变为 `active`。
3. 实时字幕 WebSocket 握手为 101，讲话后产生字幕；持续超过 30 秒，确认租约心跳正常。
4. 结束会议后，Egress 完成，录音状态变为 `completed`；对象存储中的文件大小、时长均有效，页面可以播放。
5. Worker 接到录音处理任务，完成会后转录和后续评价；以实际产物核验。

日志入口：

```sh
docker logs --since 10m ai-tool-demo
docker logs --since 10m ai-tool-worker
docker logs --since 10m livekit-server
```

对外分享日志前隐藏邀请链接、令牌和个人信息。不能只凭容器运行、接口 200、麦克风图标或页面“录音仍在继续”判定录音成功。没有启动录音的旧会议无法靠补回调恢复过去的音频；旧会议状态也不会自动补齐。

## 官方参考

- [LiveKit Webhook 配置与验签](https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events/)
- [自建 Egress：配置、Redis、资源与容器要求](https://docs.livekit.io/transport/self-hosting/egress/)
