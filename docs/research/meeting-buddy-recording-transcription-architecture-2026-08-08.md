# Meeting Buddy 会议录制、转录与智能纪要实现方案调研

查阅日期：2026-08-08

证据基线：本仓库当前代码、Electron / Apple / Microsoft 官方文档、同类产品官方帮助中心、开源项目仓库、语音与大模型厂商官方 API 文档。本文是技术选型调研，不包含产品代码、数据库或部署改动。

## 结论先行

对 Meeting Buddy，建议首版选择：

> **Electron 本机双轨音频采集（麦克风 + 系统输出） → 本地分片保底并直传现有 R2 → 会后异步转写和说话人整理 → 复用现有 Mastra/模型抽象生成结构化纪要、行动项和招聘证据。**

首版不建议自建“Bot 进入 Zoom / Meet / Teams”集群，也不建议另做 Chrome Extension。理由是：

1. **与现有产品形态最匹配。** Meeting Buddy 已经是 Electron 39 桌面应用，已有“选择招聘记录 → 开始录制”的入口；当前确认按钮仍只关闭对话框，录制链路尚未接线。[仓库：新建会议录制对话框](../../apps/desktop/src/renderer/src/components/features/meeting/new-meeting-recording-dialog.tsx)
2. **社区成熟产品已经验证这条路线。** Granola 明确没有会议 Bot，桌面端直接使用系统音频和麦克风；tl;dv、Fireflies 也都提供无 Bot 的桌面系统音频模式。它覆盖 Zoom、Teams、Google Meet、飞书、Slack、FaceTime 等任何从本机输出声音的平台，不依赖某个平台的 DOM 或会议协议。[Granola 官方：转录原理](https://docs.granola.ai/help-center/taking-notes/transcription) [tl;dv 官方：无 Bot 录制](https://intercom.help/tldv/en/articles/14433337-recording-without-a-bot) [Fireflies 官方：桌面无 Bot 录制](https://guide.fireflies.ai/articles/6666374717-how-to-record-meetings-without-a-bot-on-the-fireflies-desktop-app)
3. **把“录下来”和“实时字幕”解耦，先保证数据不丢。** 录制音频分片是事实源；实时字幕是低延迟预览，允许修订；会议结束后再基于完整音频产出最终 transcript。开源 Meetily 也把 recording path 和 VAD-filtered transcription path 分开，而不是让实时 STT 的结果反过来决定录音内容。[Meetily 官方仓库：音频双路径架构](https://github.com/Zackriya-Solutions/meetily/blob/main/CLAUDE.md#high-level-architecture)
4. **说话人首选通道确定性，不先依赖 diarization 猜测。** 麦克风轨稳定标记为 `local`，系统音频轨标记为 `remote`。一对一面试可直接映射成“面试官 / 候选人”；只有远端轨里存在多人时，才对该轨做 diarization。Granola 桌面端同样只显示 `Me` / `Them`，并明确其实时桌面转录暂不支持远端多人 diarization。[Granola 官方：说话人识别限制](https://docs.granola.ai/help-center/taking-notes/transcription)
5. **国内中文场景首轮应优先验证通义听悟，保留 Deepgram / OpenAI 作为可替换适配器。** 通义听悟官方同时提供实时/离线会议转写、说话人分离、词级时间戳及大模型纪要，标准 ASR 价格为 0.6 元/小时；当前项目也已有阿里云实时 STT 适配经验。最终供应商不能凭公开宣传确定，必须用真实中文招聘会议跑盲测。[通义听悟官方：产品与价格](https://help.aliyun.com/zh/model-studio/tingwu-meeting-summary-overview) [仓库：阿里云 STT 适配器](../../apps/livekit-agent/src/aliyun_stt.py)
6. **LLM 不应直接把“会议摘要”升级为招聘结论。** 首版输出会议事实、要点、行动项、待核实项，以及带时间范围的候选人陈述证据；任何是否进入下一阶段、评分或风险结论继续沿用项目现有的人类决策与证据约束。转录、纪要和招聘评估应是不同产物。

推荐的交付顺序：

- **MVP：会后转录**。本机双轨录制、断网续传、最终 transcript、摘要/行动项、播放与时间定位、删除与保留策略。
- **第二阶段：实时字幕**。在录制可靠之后增加低延迟草稿 transcript；会议结束后用离线结果覆盖为最终修订版。
- **第三阶段：平台原生产物适配器**。飞书会议优先拉取飞书录制/妙记；Zoom/Teams/Meet 视客户需求接平台 API。
- **只有当“用户不参会也要录”成为硬需求时，才建设或采购 Bot 进入会议能力。**

## 一、本仓库的可复用基础与真实缺口

### 已有基础

- Meeting Buddy 是 `electron-vite + React 19 + TypeScript` 的 Electron 应用，并使用 TanStack Router / Query 与工作区、招聘台数据相连。[桌面应用 README](../../apps/desktop/README.md) [桌面依赖](../../apps/desktop/package.json)
- macOS 构建配置已经声明 `NSMicrophoneUsageDescription` 和 `NSAudioCaptureUsageDescription`，说明产品方向已经包含麦克风与系统音频采集。[桌面构建配置](../../apps/desktop/electron-builder.yml)
- 后端已有独立 Hono runtime、PostgreSQL、R2/S3 兼容录制存储，以及读取录制文件的预签名 URL。[后端独立入口](../../apps/server/src/index.ts) [录制存储](../../apps/server/src/lib/server/s3.ts) [Studio 录制读取路由](../../apps/server/src/server/routes/studio/routes/interviews/routes/recordings/route.ts)
- 仓库已有 BullMQ 异步任务基础，以及 `pending → running → ready/failed`、条件抢占、失败恢复、重试次数等 LLM 摘要生命周期经验。[简历解析队列包](../../packages/resume-parse-queue/src/resume-parse.ts) [现有面试摘要任务](../../apps/server/src/server/routes/agent/utils/interview-summary-job.ts)
- 后端已有 Mastra agent、结构化生成与模型 provider 抽象，不需要为 Meeting Buddy 再引入第二套 LLM 编排框架。[简单生成 agents](../../apps/server/src/server/agents/mastra/agents/simple-generators.ts) [模型 provider](../../apps/server/src/server/agents/provider.ts)
- LiveKit agent 已经处理实时 STT、转录回传和房间录制。这些经验与测试样本可以复用，但 Meeting Buddy 的本地外部会议不等于现有 AI 面试房间，不应直接塞入同一会话表或同一个 agent 状态机。[Agent 入口](../../apps/livekit-agent/src/agent.py) [会话类型](../../packages/db-schema/src/interview-session.ts)

### 当前缺口

- `开始录制` 目前没有启动采集，只在选择了招聘记录后关闭弹窗。
- main / preload 尚未暴露音频权限、采集、文件分片、设备枚举或恢复接口；当前启动流程只注册设置、窗口、认证和 oRPC IPC。[桌面 main 入口](../../apps/desktop/src/main/index.ts) [preload 入口](../../apps/desktop/src/preload/index.ts)
- 后端没有 Meeting Buddy 专属的会话、音频分片、转录修订、纪要或同意记录；现有 `interviewConversation` 是 AI 面试运行时产物，语义不等同于真人会议记录。
- 当前录制存储只实现服务器端对象操作与读取预签名 URL，没有桌面大文件分片直传、上传清单、校验和及断点恢复协议。
- 当前独立 Hono 服务没有 Meeting Buddy 实时音频 WebSocket gateway。TanStack Start 内嵌的 `/api` 适配器也不应未经部署验证就假定能承接小时级 WebSocket。

因此，本方案建议复用基础设施和状态机模式，但新建 Meeting Buddy 自己的领域资源与 worker，不复用 AI 面试会话表来“省一个表”。

## 二、同类产品与开源社区的实际选型

### 1. Granola：本机无 Bot，系统音频与麦克风分轨语义

官方说明：

- 没有会议 Bot；桌面端运行在用户电脑上，使用系统音频和麦克风。
- 实时 transcript 把系统音频显示在左侧、麦克风显示在右侧。
- 桌面端只能给出 `Me` / `Them`；目前实时模型不能对远端多人做 live diarization。
- 系统音频是整机混音，不能隔离单个应用；音乐、通知等声音也会进入转录。
- 它把音频传给转录供应商，但不保存可播放录音，音频只为转录临时缓存。

来源：[Granola 官方：How transcription works](https://docs.granola.ai/help-center/taking-notes/transcription) [Granola 官方：Security, Privacy & Data FAQs](https://docs.granola.ai/help-center/consent-security-privacy/security-privacy-data-faqs)

对本项目的启示：

- 双轨先天比把两路混成单轨再 diarize 稳定。
- “无 Bot”不等于不需要同意；Granola 也把获得参会人同意的责任交给用户，并提供自动同意提示能力。
- Granola 不保存音频的选择不能直接照搬，因为本需求明确包含“会议录制”。Meeting Buddy 必须把音频保留与转录保留分别做成显式策略。

### 2. Fireflies：Bot 与无 Bot 双路线并存

Fireflies 桌面端可以：

- 邀请可见 Notetaker Bot；Bot 模式可捕获录音/视频、speaker labels、transcript 和 AI notes。
- 使用系统音频无 Bot 录制；有实时 transcript、AskFred/AI Skills 和会后摘要，但官方明确该模式不保存音视频文件、也没有 speaker labels。
- 自动检测 Zoom、Meet、WhatsApp、FaceTime、Discord 等通话，再让用户选择“Invite Notetaker”或“Take Notes”。

来源：[Fireflies 官方：无 Bot 桌面录制](https://guide.fireflies.ai/articles/6666374717-how-to-record-meetings-without-a-bot-on-the-fireflies-desktop-app) [Fireflies 官方：桌面应用入门](https://guide.fireflies.ai/articles/1208704416-getting-started-with-the-fireflies-desktop-app) [Fireflies 官方：Chrome Extension 邀请 Bot](https://guide.fireflies.ai/articles/1828418979-how-to-invite-fireflies-ai-notetaker-using-the-chrome-extension)

对本项目的启示：

- 同一产品可以同时存在“隐形本机采集”和“可见 Bot”两种 capture adapter，数据模型不应把 capture mode 写死。
- Speaker label 质量差异首先来自音频来源与平台元数据，而不只是换一个更大模型。
- 浏览器扩展适合 Google Meet 内嵌体验，但它是平台特定补充，不是已有 Electron 应用的首选底座。

### 3. Otter：日历驱动的参会 Bot

Otter Notetaker：

- 可根据同步的 Google / Microsoft 日历自动加入 Zoom、Google Meet 或 Microsoft Teams，并实时转录。
- Bot 以会议参与者身份出现；可以在用户本人不参会时独立进入会议。
- 它只能以 guest 身份进入，可能被等候室、外部参与者策略或主持人录制授权阻止。

来源：[Otter 官方：Notetaker Overview](https://help.otter.ai/hc/en-us/articles/4425393298327-Otter-Notetaker-Overview) [Otter 官方：Zoom 设置](https://help.otter.ai/hc/en-us/articles/19504911385495-Set-up-Otter-Notetaker-to-join-your-Zoom-meeting) [Otter 官方：手动添加 Notetaker](https://help.otter.ai/hc/en-us/articles/13676219922711-Manually-add-Otter-Notetaker-to-a-meeting)

对本项目的启示：

- Bot 的核心价值不是“能转录”，而是无人值守、统一服务器录制、日历自动化和平台参与者身份。
- 代价是等待室、访客策略、录制授权、密码、平台规则与 UI 变化。若 Meeting Buddy 首版要求用户本人点击开始，这些成本没有对应收益。

### 4. tl;dv：Bot、Extension、桌面系统音频三种入口

tl;dv 官方当前同时提供：

- 日历自动录制时派 Bot；
- Google Meet Chrome Extension；
- macOS / Windows 桌面端无 Bot 系统音频录制，可覆盖 Zoom、Meet、Teams、Slack、Discord 等任意输出音频的平台。

无 Bot 模式只捕获麦克风和系统音频，不捕获视频、共享屏幕或聊天；官方也提醒整机播放的其他声音会一起被录入，并要求用户通知参会人。[tl;dv 官方：桌面应用](https://intercom.help/tldv/en/articles/14433922-record-meetings-on-any-platform-with-or-without-a-bot-tl-dv-desktop-app) [tl;dv 官方：无 Bot 录制](https://intercom.help/tldv/en/articles/14433337-recording-without-a-bot) [tl;dv 官方：Consent Collection](https://intercom.help/tldv/en/articles/12109041-consent-collection)

对本项目的启示：

- 桌面采集可以作为通用底座，Bot/Extension 是增长到特定会议平台后的增强，不必倒过来。
- 通话自动检测适合后续降低“忘记录制”，首版仍应由用户显式启动，避免误录。

### 5. Krisp：虚拟音频设备、部分本地 STT 与云端摘要

Krisp 把桌面应用做成虚拟麦克风和扬声器，可插入 Zoom、Skype 等任意通话应用。官方安全页说明：

- 自有 STT 可在终端设备生成 transcript；Meeting Assistant 数据由用户选择是否存入 Krisp Cloud。
- 摘要使用 Microsoft Azure；只发送所需数据。
- 不同语言与模式下，音频可能完全在本机转录，也可能发服务器转录后立即删除。

来源：[Krisp 官方：Security for AI Meeting Assistant](https://krisp.ai/security-for-ai-meeting-assistant/) [Krisp 官方：What data Krisp sends to the cloud](https://help.krisp.ai/hc/en-us/articles/360012035500-What-data-Krisp-sends-to-the-cloud) [Krisp 官方：AI Meeting Assistant overview](https://help.krisp.ai/hc/en-us/articles/8214720684956-AI-Meeting-Assistant-overview)

对本项目的启示：

- 虚拟音频设备能更精确控制路由和降噪，但会显著增加驱动签名、系统兼容和客服成本，不应作为 Electron MVP 前置。
- “本地 STT + 云端 LLM”是可行的隐私分层：原始音频不出端，只把 transcript 发给摘要模型。它适合未来的企业隐私版本。

### 6. Meetily：本地 Rust 音频管线与本地模型

Meetily 是 Tauri + Rust 桌面应用，官方仓库列出的栈包括：

- `cpal` / 平台原生接口采集麦克风和系统音频；macOS 使用 ScreenCaptureKit，Windows 使用 WASAPI。
- recording path 对音频做混音、ducking 和 clipping prevention；transcription path 用 VAD 只把语音段送入 Whisper。
- Whisper.cpp / whisper-rs / Parakeet 做本地转录，Ollama 或云端 LLM 做摘要。

来源：[Meetily 官方仓库架构](https://github.com/Zackriya-Solutions/meetily/blob/main/CLAUDE.md#project-overview)

对本项目的启示：

- 录音与转录必须是两条消费者管线，VAD 只能节约 STT，不得删减原始录音。
- Electron Web API 足以验证 MVP；如果后续需要应用级音频隔离、低延迟 DSP 或本地模型，才把采集核心下沉为 Rust / 原生 helper。

### 7. Screenpipe：本地事实库与权限边界

Screenpipe 默认把屏幕帧、音频、transcript 和搜索索引保存在本地；使用云转录、云模型或云同步时，才把选择的数据发送给相应服务。它还为 AI agent 提供确定性的 app/window/content/time 权限边界。[Screenpipe 官方仓库](https://github.com/screenpipe/screenpipe)

对本项目的启示：

- 本地 spool 不应只是临时实现细节；它是断网恢复、可审计删除和未来本地模式的边界。
- 传给摘要模型的上下文应可控制，不能默认把整份简历、所有历史面试和原始音频一并发给模型。

### 8. Vexa / Meeting BaaS：Bot 基础设施的真实复杂度与许可证

Vexa 的开源实现是容器化 Bot fleet：Bot 进入 Meet / Teams / Zoom / Jitsi，流式输出带说话人的 transcript，使用 Redis、对象存储，并按 workload 起容器或 Kubernetes Pod。官方 quickstart 对完整栈给出至少 8 vCPU / 16 GB RAM 的构建机建议。[Vexa 官方仓库](https://github.com/Vexa-ai/vexa)

Meeting BaaS 提供统一的 Zoom / Meet / Teams Bot API，但其核心 Bot 与编排服务是 BSL source-available，不是可无条件用于商业 SaaS 的宽松开源；官方条款限制向第三方提供商业产品，并在 18 个月后转换为 Apache 2.0。[Meeting BaaS 官方许可证说明](https://www.meetingbaas.com/en/legal/license)

对本项目的启示：

- “开源会议 Bot”不是一段 Puppeteer 脚本，而是浏览器/平台接入、容器调度、媒体转码、状态/重试、等待室、机器人身份和持续适配的独立子系统。
- 若未来必须上 Bot，先在 Vexa、Recall/Meeting BaaS 类托管服务与自建之间做采购/许可证评审，不要默认 copy 代码即可商用。

## 三、四种录制接入方式对比

| 接入方式          | 典型产品                                                  | 优点                                                                              | 关键限制                                                                                  | 对 Meeting Buddy 的建议                  |
| ----------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------- |
| Electron 本机音频 | Granola、Krisp、tl;dv Desktop、Fireflies Desktop、Meetily | 跨平台会议软件；无可见 Bot；与当前 Electron 一致；用户本人控制开始/停止           | 用户必须在本机参会；权限/音频路由复杂；会录入系统通知；远端多人缺身份元数据               | **MVP 首选**                             |
| 会议 Bot 参会     | Otter、Fireflies Bot、tl;dv Bot、Vexa                     | 可无人值守；服务器统一录制；可能获得参会者/活跃说话人信息；不依赖用户电脑持续在线 | 等待室/访客策略/授权；平台 UI 与协议变化；每场会议资源成本；可见参与者；许可证与 ToS 风险 | 延后，只有无人值守成为硬需求时评估       |
| 浏览器 Extension  | Fireflies / tl;dv 的 Meet 路径                            | 可嵌入 Google Meet UI/聊天；较容易识别当前 tab 和 meeting URL                     | 主要覆盖浏览器会议；原生 Zoom/Teams/飞书不覆盖；DOM/权限/商店审核变化                     | 不做通用底座；未来只作为 Meet 增强       |
| 平台录制/API      | 飞书妙记、Zoom Cloud Recording 等                         | 平台生成录制和身份信息；用户本机无需持续上传；平台原生同意提示                    | 强 provider lock-in；管理员权限/版本/存储配额；不同事件和产物状态                         | 作为 adapter；飞书会议优先接现有飞书链路 |

### 明确的产品边界

首版本机采集应承诺的是：

- 支持当前电脑播放出来的会议音频，以及当前选择的麦克风。
- 支持用户显式开始、暂停、继续、停止。
- 支持一对一会议稳定区分 `local` / `remote`。
- 支持断网继续录、联网续传。

不应承诺：

- 自动知道系统音频中的每个远端参与者真实姓名。
- 只录某一个应用而绝不录系统通知。
- 用户不参会或关机后继续录。
- 所有 macOS / Windows / Linux 版本行为一致。

## 四、Electron 音频采集方案

### 平台事实

Electron 官方 `desktopCapturer` 示例通过 `session.setDisplayMediaRequestHandler` 返回 `audio: "loopback"`，renderer 再调用 `getDisplayMedia()` 获取系统音频。Electron 39 起，Chromium 在 macOS 默认使用 Apple CoreAudio Tap API；macOS 14.2+ 必须有 `NSAudioCaptureUsageDescription`，缺失时仍可能得到一条“静音的死轨”而没有明显错误。macOS 12.7.6 及以下没有无需签名内核扩展的系统音频捕获能力；Electron 官方建议使用 macOS 13+，或依赖 BlackHole/Soundflower 等虚拟设备。[Electron 官方：desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer)

本仓库已经有 `NSAudioCaptureUsageDescription`。因此建议：

- 首版 macOS 最低版本设为 **13**，主要测试矩阵放在 **14.2+**。
- 不将 Linux 纳入首版承诺；PipeWire portal、发行版和桌面环境差异单独评估。
- Windows 走 Chromium/Electron loopback；底层 Windows WASAPI 官方支持捕获 render endpoint 的系统混音。[Microsoft 官方：WASAPI Loopback Recording](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording)

### 推荐采集拓扑

```text
Mic getUserMedia() ───────┬─> local 原始分片 ─> 本地 spool ─> R2
                          └─> AudioWorklet PCM ─> 实时 STT(local，可选)

System getDisplayMedia() ─┬─> remote 原始分片 ─> 本地 spool ─> R2
                           └─> AudioWorklet PCM ─> 实时 STT(remote，可选)

local + remote ─> 会后派生播放混音（不是事实源）
```

关键决策：

1. **始终保留两条原始轨。** 不在采集端只保存混音。双轨能确定本机/远端角色，也便于单独增益、降噪、重转写与排障。
2. **录制与实时转录各自消费音频。** 录制用稳定压缩分片；实时转录用 AudioWorklet 取 PCM、重采样为供应商要求的格式。实时 STT 断开不影响录音。
3. **分片而非会后生成一个大 Blob。** 建议 15–30 秒一个不可变片段，包含 `sessionId + track + sequence + startedAt + duration + sha256`。先原子落地本地，再上传并在服务端幂等确认。
4. **会后合并只生成派生产物。** 服务端可将双轨正规化、对齐并生成可播放混音，但 transcript 的时间坐标继续基于会话单调时钟，而不是依赖播放器文件拼接偏移。
5. **检测“死轨”。** 开始后的数秒内检测音量/RMS；系统音频轨长期全零时给出明确权限/路由提示，不能只显示“正在录制”。这直接对应 Electron 官方所述 macOS 静音死轨风险。
6. **设备变化显式处理。** 蓝牙耳机切换、默认输出改变、睡眠/唤醒或会议软件改用另一个设备时，标记 quality event 并提示用户；不要静默继续生成空 transcript。

### 本地恢复边界

建议本地 spool 清单至少记录：

- 服务端 `sessionId` 与工作区/招聘记录引用；
- capture device 标识、采样率、轨道、序号、单调时间；
- 文件路径、大小、hash、上传状态与远端 object key；
- 用户点击停止、应用崩溃、系统休眠、设备丢失等结束原因。

应用重启时只扫描 Meeting Buddy 自己的 spool 目录，提示“发现未完成录制”，允许继续上传或删除。已被服务端确认且超过本地缓冲期的分片再清理。不要在 renderer 内存里维护唯一清单。

## 五、转录与说话人方案

### 先定义三类 transcript

| 产物                         | 用途                                         | 可变性                           | 是否可驱动最终纪要 |
| ---------------------------- | -------------------------------------------- | -------------------------------- | ------------------ |
| `live draft`                 | 会议中字幕与“正在工作”反馈                   | 会反复修订、可断线               | 否                 |
| `final transcript`           | 会后基于完整音频的最终文本、说话人和时间范围 | 新 revision 覆盖旧 revision      | 是                 |
| `human corrected transcript` | 用户改名、纠错、删除敏感段                   | 不覆盖原始模型产物，保留审计来源 | 是，优先级最高     |

不要在同一 JSON 数组上原地覆盖而无法解释来源。每个 turn 至少需要：

```ts
{
  id: string;
  revision: number;
  track: "local" | "remote";
  speakerKey: string; // local / remote-0 / remote-1
  speakerDisplayName: string | null;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
  source: "live" | "offline" | "human";
  provider: string;
  model: string;
}
```

### 说话人策略

1. **一对一默认不做全局 diarization。** `local` 与 `remote` 由物理轨决定，准确、低成本、可解释。
2. **远端多人时只 diarize remote 轨。** 输出 `remote-0/1/...`，会后让用户把匿名 label 映射成姓名。没有可靠证据时不要由 LLM 根据语义猜姓名。
3. **面对面会议是另一种 capture profile。** 所有人共用麦克风时必须做 diarization；与线上会议的 `local/remote` 语义不同。
4. **Bot / 平台 API 模式可带 participant identity。** 但仍要把“平台 participant id”“声纹聚类 label”“用户确认姓名”分开存，避免把概率聚类当成身份认证。
5. **重叠讲话需要质量标记。** AssemblyAI 官方也明确说明 live diarization 在短发言、会话开头、噪声和重叠讲话下会不稳定；重叠语音通常只分给一个 speaker。[AssemblyAI 官方：Streaming Diarization limitations](https://www.assemblyai.com/docs/streaming/label-speakers-and-separate-channels)

### 实时与离线的职责

- 实时：优先低延迟与稳定段落，只用于字幕/用户反馈。
- 离线：优先中文准确率、标点、词级/句级时间、说话人一致性和领域词，允许在数分钟内完成。
- LLM 纪要：只读取最终 transcript revision；如果用户已纠错，则读取 human-corrected view。
- 失败恢复：离线任务按 `sessionId + audioManifestHash + provider + modelVersion` 幂等；模型或提示词改变时创建新 revision，不覆盖旧结果。

## 六、语音/大模型供应商比较

价格只用于量级判断，查阅日为 2026-08-08；供应商经常调整模型、促销价、区域和企业条款，上线前必须以账号控制台/合同复核。

### 1. 通义听悟：推荐作为中文 MVP 第一候选

官方能力：

- 实时音频流或音视频文件转写；支持中文、英文、粤语、日语、韩语、德语、法语、俄语。
- 返回段落、句子和词级起止时间。
- 实时会议与文件转写均包含说话人分离；文件转写还包含自动语种识别。
- 提供全文摘要、发言总结、要点回顾、待办事项、关键词、口语书面化和自定义 prompt。
- ASR 标准价 0.6 元/小时；每项大模型能力 0.064 元/小时；不同能力叠加计费。

来源：[通义听悟官方：产品概述与计费](https://help.aliyun.com/zh/model-studio/tingwu-meeting-summary-overview)

适配判断：

- **优势：** 中文和国内网络/采购路径更适合本项目；一个异步任务可同时拿转写、diarization 与常见纪要；当前 LiveKit agent 已经有阿里云 Paraformer/Gummy STT 适配和测试经验。
- **风险：** 通义听悟是高层 job API，返回结构、状态和智能纪要能力会形成 provider lock-in；不能让其原始响应直接成为数据库领域模型。
- **建议：** MVP 用它做离线最终 transcript；是否同时使用它的大模型纪要，要与现有 Mastra 结构化输出做同样样本对比。若使用现有 Mastra 更容易绑定招聘证据和 prompt version，就只采购其 ASR。

### 2. Deepgram Nova-3：国际化/实时方案候选

官方能力：

- Nova-3 官方推荐用于会议、活动字幕、多说话人、噪声和远场音频，支持 batch 与 streaming；简体中文可使用 `zh` / `zh-CN` / `zh-Hans`。
- Diarization 支持 Nova batch 和 streaming；batch 当前可用 v2，streaming 当前仍是 v1，并返回逐词 speaker。
- 官方标价 Nova-3 单语 streaming 为 0.0048 美元/分钟（约 0.29 美元/小时）；speaker diarization add-on 为 0.0020 美元/分钟（0.12 美元/小时）。页面标注 streaming 是限时促销价。

来源：[Deepgram 官方：模型与语言](https://developers.deepgram.com/docs/models-languages-overview/) [Deepgram 官方：Speaker Diarization](https://developers.deepgram.com/docs/diarization) [Deepgram 官方：Pricing](https://deepgram.com/pricing)

适配判断：

- **优势：** 实时和离线共用 Nova 数据模型，中文、keyterm、逐词时间和 diarization 能力完整；适合后续实时字幕。
- **风险：** 音频跨境/区域、企业数据条款和国内网络可用性需要单独确认；streaming diarizer 与 batch diarizer 版本不同，实时 speaker label 不能直接视作最终结果。
- **建议：** 与通义听悟并列进入 20–50 场真实样本盲测；若 live transcript 是发布首要指标，再考虑优先 Deepgram。

### 3. OpenAI transcription：适合离线复核，不作为首版实时 speaker 方案

官方当前说明：

- `gpt-4o-transcribe-diarize` 能返回带 `speaker/start/end` 的 `diarized_json`，长于 30 秒需要 `chunking_strategy`；还可提供最多 4 个 2–10 秒已知说话人参考片段。
- Speaker labeling 只在 `/v1/audio/transcriptions`；Realtime transcription session 不支持 speaker labeling。流式文件转录也只会在 segment 完成后给 speaker，不给 partial speaker。
- 文件最大 25 MB；更大录音要压缩或切分，并尽量不要从句中切断。
- Diarization 模型不支持 prompt；词级 timestamp 目前是 `whisper-1` 的专属参数。这意味着“带 speaker 的结果”与“词级精确时间/自定义术语提示”不能想当然地在一个请求里同时获得。

来源：[OpenAI 官方：Speech-to-text guide](https://developers.openai.com/api/docs/guides/speech-to-text) [OpenAI 官方：GPT-4o Transcribe Diarize](https://developers.openai.com/api/docs/models/gpt-4o-transcribe-diarize)

适配判断：

- **优势：** 离线 speaker-attributed transcript 接口简单；已知 speaker reference 对固定 HR 声音可能有价值；仓库后端已有官方 `openai` SDK。
- **风险：** 不提供 realtime diarization；25 MB 限制要求稳健切分；时间戳和 prompt 能力组合受限；按 audio token 计价不如按小时直观。
- **建议：** 作为离线 A/B 或困难样本复核 provider，不把它设为首版唯一来源。

### 4. AssemblyAI：能力完整，但中文路径不是其主力 Universal Streaming

官方当前说明：

- Streaming diarization 支持所有 streaming model，可输出 turn 与逐词 speaker；官方明确早期 turn、短于约 1 秒的声音、重叠讲话和噪声会降低表现。
- Universal-Streaming Multilingual 当前只覆盖英、西、德、法、葡、意 6 种语言，不含中文。
- 中文需要走 99+ 语言的 Whisper Streaming，官方价格 0.30 美元/小时；streaming speaker diarization add-on 为 0.12 美元/小时。

来源：[AssemblyAI 官方：模型与价格](https://www.assemblyai.com/docs/faq/how-can-i-use-universal-1) [AssemblyAI 官方：Streaming Diarization](https://www.assemblyai.com/docs/streaming/label-speakers-and-separate-channels) [AssemblyAI 官方：Pricing](https://www.assemblyai.com/pricing)

适配判断：功能可行，但中文并非 Universal Streaming 的当前主路径，优先级低于通义听悟与 Deepgram。

### 5. 本地 Whisper / Parakeet / Ollama：隐私版本，而不是默认 MVP

Meetily 已证明 Tauri/Rust + Whisper.cpp / Parakeet + Ollama 可以把采集、转录和摘要都留在本机；Screenpipe 也默认本地保存音频、transcript 和索引。[Meetily 官方仓库](https://github.com/Zackriya-Solutions/meetily) [Screenpipe 官方仓库](https://github.com/screenpipe/screenpipe)

但对本项目，它会新增：

- 模型下载、校验、磁盘配额与自动更新；
- Intel Mac、Apple Silicon、Windows CPU/NVIDIA/AMD 的性能矩阵；
- 长会议实时积压、热量/电量与风扇噪声；
- diarization/forced alignment 的另一套模型与运行时；
- 端侧模型质量和安全更新的客服责任。

因此建议只保留 provider interface，使未来能加 `local` 实现；首版不随 Electron 安装包分发大模型。

### 推荐的供应商抽象

不要让业务层感知“听悟 TaskId”“Deepgram request id”或 OpenAI 原始 segment。定义两个独立 port：

```ts
interface MeetingTranscriptionProvider {
  startLive?(input: LiveTranscriptionInput): Promise<LiveSession>;
  transcribeFinal(input: FinalTranscriptionInput): Promise<CanonicalTranscript>;
  getJob?(providerJobId: string): Promise<ProviderJobState>;
}

interface MeetingIntelligenceProvider {
  generate(input: {
    transcript: CanonicalTranscript;
    meetingContext: MeetingContextSnapshot;
    templateVersion: string;
  }): Promise<MeetingIntelligence>;
}
```

STT 与 LLM 不绑定同一厂商。这样可以用听悟做中文 ASR，继续用现有 Mastra 模型生成与招聘语义一致的结构化产物。

## 七、推荐系统架构

```text
┌──────────────────────── Meeting Buddy / Electron ────────────────────────┐
│ 权限与设备检查                                                            │
│ Mic capture ─┐                                                           │
│ System audio ├─> rolling chunks ─> local spool ─> presigned upload ─┐   │
│              └─> optional PCM live draft ─> transcription gateway    │   │
│ 用户笔记 / consent attestation / quality events                       │   │
└────────────────────────────────────────────────────────────────────────┘   │
                                                                            ▼
┌──────────────────────────── Hono backend ─────────────────────────────────┐
│ Meeting Capture API                                                       │
│ create / chunk lease / ack / stop / retry / delete                        │
│                                                                            │
│ Postgres: session + track + chunk manifest + transcript revision           │
│ R2: immutable original chunks + derived mix                                │
│ BullMQ: finalize -> ASR -> canonicalize -> intelligence -> notify          │
└──────────────────────────────────┬─────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
          Transcription provider              Mastra agents
          Tingwu / Deepgram / local           summary/actions/evidence
```

### 为什么首版不经 LiveKit 传音频

LiveKit 是本仓库已有能力，但 Meeting Buddy 已经在用户电脑上拥有原始音频。仅为了上传录音再建一个私有 LiveKit 房间、发布两条轨、部署订阅 agent 和 egress，会多出房间生命周期、媒体重连、agent 调度与 egress 成本，却仍不能代替本地断网保底。

因此建议：

- **会后转录 MVP：** 不经 LiveKit，分片直传 R2，worker 调用离线 ASR。
- **实时字幕第二阶段：** 优先使用供应商短期凭证让桌面直连 streaming API，或在独立 Hono Node runtime 增加专用 WebSocket gateway；不得把永久 API key 放进 Electron。
- **只有当 LiveKit 能同时解决已验证的媒体路由/监控/配额需求时再复用。** 不因“仓库已经有 LiveKit”就把它变成所有音频的必经层。

### 服务端状态机

建议的会话状态：

```text
draft
  -> recording
  -> stopping
  -> uploading
  -> transcribing
  -> summarizing
  -> ready

任一异步阶段 -> failed（可从明确阶段重试）
recording -> interrupted（崩溃/设备丢失，可恢复上传或结束）
draft/recording/interrupted -> discarded（用户明确删除）
```

不要用一个 `processing: boolean`。至少分别记录：

- `captureStatus`
- `uploadStatus`
- `transcriptionStatus`
- `intelligenceStatus`
- `failureStage / errorCode / attempts / startedAt`

`ready` 也不意味着所有可选产物都成功；例如 transcript ready 而智能纪要 failed 时，用户仍应能看 transcript 并单独重试纪要。

### 领域资源建议

当前 `CONTEXT.md` 尚未定义 Meeting Buddy 的领域术语。本文临时使用下列名字，实施前应通过 domain-modeling 确认：

- **Meeting Capture Session**：一次用户显式开始和停止的真人会议采集，不等于 AI Interview Round。
- **Audio Track**：`local microphone` 或 `system output` 的连续逻辑轨。
- **Audio Chunk**：一条轨上的不可变上传片段。
- **Transcript Revision**：由 live/offline/human 产生的一版规范化 transcript。
- **Meeting Intelligence**：摘要、行动项、问题、待核实项和招聘证据的结构化派生产物；不等于候选人最终评价。

关系建议：Meeting Capture Session 必须属于一个 Workspace，可选关联一个 Resume Record；“未关联候选人的即时会议”是否允许，需要产品明确决定，不能让数据库约束替产品做决定。

## 八、大模型纪要设计

### 输入边界

推荐输入：

- 最终 transcript revision；
- 会前用户选择的 Resume Record 的最小快照：候选人姓名、目标岗位、面试阶段；
- 用户手写笔记；
- 可选的岗位重点/预设问题。

默认不输入：

- 原始音频；
- 候选人所有历史简历附件和其他工作区资料；
- 不属于当前招聘记录的聊天、邮件或面试；
- 模型推理过程。

### 输出契约

建议用结构化生成，不只生成一段 Markdown：

```ts
interface MeetingIntelligence {
  summary: string;
  topics: Array<{ title: string; summary: string; evidenceTurnIds: string[] }>;
  actionItems: Array<{
    text: string;
    owner: string | null;
    dueDate: string | null;
    evidenceTurnIds: string[];
  }>;
  candidateEvidence: Array<{
    claim: string;
    attribution: "candidate" | "interviewer" | "unknown";
    status: "stated" | "needs_verification";
    evidenceTurnIds: string[];
  }>;
  openQuestions: Array<{ text: string; evidenceTurnIds: string[] }>;
  qualityWarnings: string[];
}
```

设计约束：

- 每个会影响招聘判断的条目都引用 transcript turn/time range。
- 把候选人自述写成“候选人表示……”，不自动升级为已核实事实。
- 不从音色、口音、停顿推断性格、年龄、健康或受保护属性。
- 行动项的 owner / due date 没有明确证据时返回 `null`，不由模型补齐。
- 存 `model`, `provider`, `prompt/template version`, `transcript revision`, `generatedAt`。
- 用户重新转写或修改 transcript 后，旧纪要标记 stale，而不是静默保持“ready”。

现有 `runSummaryJob` 已经展示了条件抢占、running 超时回收、失败状态与可重试模式，可复用这种生命周期，但 Meeting Buddy 应使用自己的 job 与表。[仓库：现有摘要任务](../../apps/server/src/server/routes/agent/utils/interview-summary-job.ts)

## 九、隐私、安全与同意

这不是法律意见；会议录音和招聘数据涉及多个司法辖区、员工/候选人关系与跨境处理，上线前需要业务、法务和目标客户管理员共同确认。技术上至少需要：

### 录制前

- 开始录制前显示明确文案：采集麦克风、系统音频、转写、摘要目的、保存位置和保留期。
- 用户必须确认已通知参会人；记录 `consentAttestedAt` 和当时的文案版本。
- 提供可复制的会议聊天提示；平台允许时再自动发送。无 Bot 模式不会天然弹出平台录制提示，tl;dv 和 Granola 都明确把通知参会人作为用户责任。[tl;dv 官方：无 Bot 录制与同意](https://intercom.help/tldv/en/articles/14433337-recording-without-a-bot) [Granola 官方：同意与隐私](https://docs.granola.ai/help-center/consent-security-privacy/security-privacy-data-faqs)
- 全程显示不可忽略的录制状态；暂停与停止必须真正停止音频消费者，而不只是隐藏 UI。

### 数据最小化与访问

- 音频、transcript、纪要全部带 `workspaceId`，复用 Workspace RBAC，不允许只凭对象 URL 长期公开访问。
- R2 使用不可预测 key，播放使用短期预签名 URL；原始轨、派生混音、transcript 和纪要分别授权/删除。
- 永久 provider API key 只在服务端；Electron 只拿短期、会话级能力。
- provider 请求日志不得记录原始音频、完整 transcript、候选人邮箱或带签名对象 URL。
- 删除必须覆盖：Postgres 元数据、R2 原始与派生对象、本地 spool、搜索/向量索引、异步任务和缓存；失败项可观测并可补偿。

### 保留策略

产品必须明确以下两项，不能用一个“保留会议”开关代替：

1. 原始音频保存多久；
2. transcript / 纪要保存多久。

可以支持“转写完成即删原始音频、只留 transcript”，也可以按工作区策略保留录音用于证据回放。默认期限、法定保存与 legal hold 需另行决定。

### 供应商数据边界

- 阿里云百炼官方称不会将客户数据用于模型训练，但会依法律法规存储模型/应用调用产生的数据；具体期限和地域要查服务协议与合同。[阿里云百炼官方：合规资质与隐私](https://help.aliyun.com/zh/model-studio/privacy-notice)
- OpenAI API 默认不使用输入/输出训练模型；默认 abuse monitoring logs 可能保留最长 30 天，符合条件的客户可申请 Zero Data Retention，且具体 endpoint/model 是否支持要核对当前数据控制表。[OpenAI 官方：API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint) [OpenAI 官方：Business data](https://openai.com/business-data/)
- 使用 Deepgram/OpenAI 等境外 API 处理中国候选人会议，会引入跨境传输和区域处理问题；这是一项架构/采购决策，不只是换环境变量。未完成法务和客户合同确认前，不应默认开启。

## 十、成本与延迟边界

### 可核算的直接模型成本

按 1,000 场、每场 60 分钟，仅作为公开价格量级示例：

| 方案                                         | 公开单价                  | 1,000 小时量级 | 不包含                       |
| -------------------------------------------- | ------------------------- | -------------- | ---------------------------- |
| 通义听悟 ASR                                 | 0.6 元/小时               | 600 元         | R2、网络、worker；LLM 能力   |
| 通义听悟 ASR + 2 项大模型能力                | 0.6 + 2 × 0.064 元/小时   | 728 元         | 自定义 Mastra LLM、存储      |
| Deepgram Nova-3 单语 streaming + diarization | 0.0048 + 0.0020 美元/分钟 | 约 408 美元    | 促销结束差价、LLM、存储/出网 |
| AssemblyAI Whisper Streaming + diarization   | 0.30 + 0.12 美元/小时     | 约 420 美元    | LLM、存储/出网               |

OpenAI `gpt-4o-transcribe-diarize` 按 audio token 输入/文本 token 输出计费，公开模型页没有给出简单可靠的“每小时固定价”，不在这里强行换算。[OpenAI 官方模型页](https://developers.openai.com/api/docs/models/gpt-4o-transcribe-diarize)

真实总成本还包括：

- 两条原始音频轨与派生混音的 R2 存储、读取与生命周期删除；
- 音频正规化/合并 worker 的 CPU；
- realtime WebSocket 持续时间与 idle 计费；
- 失败重试和重复转写；
- LLM 输入 transcript token 与多版生成；
- Bot 模式每场会议的浏览器/容器资源（若未来引入）；
- 客服处理权限、设备路由和误录/漏录。

### 延迟目标建议

公开文档只能证明功能存在，不能替代本项目 SLO。建议实验期记录：

- `capture start → first non-zero frame`
- live partial latency P50/P95（若启用）
- live final segment latency P50/P95
- `stop → all chunks uploaded`
- `all chunks uploaded → final transcript ready`
- `final transcript ready → intelligence ready`
- 失败率、恢复成功率、空轨率、音频缺口毫秒数

MVP 可接受“停止后数分钟出最终 transcript”；不可接受为了看起来实时而在网络断开时丢失原始录音。

## 十一、实施阶段与验收标准

### Phase 0：真实样本评测（先于产品实现）

准备 20–50 段已获许可的招聘会议，覆盖：

- 普通话、粤语、中文夹英文岗位/公司/技术名词；
- 内置麦克风、AirPods、USB 耳机；
- 安静/办公室噪声、弱网；
- 一对一、远端多人、重叠讲话；
- Zoom、Teams、Google Meet、飞书、电话/FaceTime。

同一音频盲测通义听悟、Deepgram Nova-3，选取部分困难样本用 OpenAI diarize 复核。指标：

- 中文 CER；
- 人名、公司、岗位、数字、薪资和技术关键词召回；
- speaker turn attribution accuracy / DER；
- 时间戳漂移；
- 重叠讲话丢失；
- 最终完成延迟与实际账单；
- 失败/重试行为与数据删除能力。

没有这轮数据，不应说某厂商“准确率最高”。厂商自己的 benchmark 不代表本项目的中文招聘音频。

### Phase 1：可靠录制与会后转录

范围：

- macOS 13+ 与 Windows 11；
- 手动开始/暂停/继续/停止；
- 麦克风/系统双轨、本地分片、R2 续传；
- 一对一 `local/remote` transcript；
- 通义听悟或盲测胜出的 provider 做最终 transcript；
- 结构化摘要、行动项、候选人陈述证据；
- 播放、时间跳转、speaker 重命名、删除；
- 权限向导、空轨检测、未完成录制恢复。

验收：

- 60 分钟会议中 app 重启/断网后，已落地分片可恢复，音频缺口在定义的阈值内。
- 系统音频权限拒绝、死轨、设备切换能给可操作错误，不生成“成功但空白”的记录。
- 重复 stop、重复上传 ack、重复 worker 不会生成重复会话/费用。
- transcript 中每个 turn 都可定位到音频时间范围。
- 删除流程能证明本地、数据库、对象存储与派生产物清除完成。

### Phase 2：实时 transcript

范围：

- live draft 与 final revision 分开；
- reconnect / resume，不重复最终 turn；
- provider 临时凭证或独立 WebSocket gateway；
- 实时失败不影响录音；
- 会后离线 transcript 覆盖并明确标记已校正。

### Phase 3：平台原生与 Bot adapter

优先顺序：

1. 飞书会议：复用已有飞书 VC / recording_ready / 妙记研究与权限体系；平台产物 ready 后导入同一个 canonical transcript 模型。[仓库：飞书会议与纪要调研](./feishu-human-interview-meeting-integration-2026-08-05.md)
2. 客户明确需要的 Zoom/Teams/Meet cloud recording API。
3. 无人值守、多平台 Bot；先评估托管 API、Vexa 自建和许可证/平台条款，再决定。

## 十二、需要在 grilling 中确认的产品决策

这些问题会实质改变架构，不能由工程静默代答：

1. **“录制”是否意味着用户必须能回放原始音频？** 如果只需要 transcript，Granola/Fireflies 的不保存音频路线更低风险；如果需要证据回放，则必须定义保留和删除。
2. **首版必须实时看到字幕吗？** 若不是，先做会后离线能显著降低网络、WebSocket 和修订复杂度。
3. **是否允许不关联 Resume Record 的即时会议？** 这决定 Meeting Capture Session 的外键是否必填。
4. **目标平台与 OS 排序是什么？** 飞书 + macOS 与 Zoom/Teams + Windows 的最优接入和测试矩阵不同。
5. **是否存在“我不参会，也让助手去录”的场景？** 只有答案为是，Bot 才从未来能力变为主架构。
6. **同一场会议通常是一对一还是 panel interview？** 后者要求 remote diarization、speaker rename 和质量提示进入 MVP。
7. **原始音频、transcript、纪要各保留多久？谁能删除？** 工作区是否允许管理员设置策略？
8. **是否允许音频/文本发往境外供应商？** 如果否，provider shortlist 将收缩为国内/自托管方案。
9. **会议纪要是否只做事实整理，还是要生成候选人评价？** 后者必须进入现有 evidence-backed interview report 体系，不能由通用会议 prompt 直接落结论。
10. **需要捕获屏幕/共享 PPT/聊天吗？** 本方案首版只处理音频；加入屏幕会改变权限、存储、隐私与成本。
11. **用户手写笔记如何参与 AI？** 是事实来源、仅供提示，还是需要与 transcript 冲突提示？
12. **准确率与延迟谁优先？** 应以中文招聘样本的验收阈值量化，而不是“尽量准确且实时”。

## 十三、推荐决策摘要

| 决策              | 推荐                                           | 置信度 | 仍需验证                            |
| ----------------- | ---------------------------------------------- | ------ | ----------------------------------- |
| 首版录制入口      | Electron 本机 mic + system audio               | 高     | macOS/Windows 目标设备矩阵          |
| 音频事实源        | 双轨、滚动不可变分片、本地保底 + R2            | 高     | 编码/分片长度与目标 ASR 输入        |
| 首版 transcript   | 会后离线 final                                 | 高     | 产品是否硬性要求 live               |
| 说话人            | 物理轨先分 local/remote，remote 多人再 diarize | 高     | panel interview 占比                |
| 中文 ASR          | 通义听悟作为首个适配器并与 Deepgram 盲测       | 中     | 真实 CER、实体召回、删除/地域与合同 |
| OpenAI diarize    | 离线 A/B/困难样本复核                          | 中     | 中文效果、token 账单、数据区域      |
| LLM 纪要          | 复用 Mastra 结构化 agent，独立于 STT provider  | 高     | 最终产品输出字段                    |
| LiveKit           | 不作为 MVP 音频上传必经层                      | 中高   | live 阶段是否能带来明确复用收益     |
| Browser Extension | 不做首版                                       | 高     | 是否要求 Meet 内嵌体验              |
| Bot               | 延后到无人值守成为硬需求                       | 高     | 企业客户路线                        |
| 本地模型          | 保留 provider seam，后续企业隐私版本           | 中高   | 端侧性能与商业需求                  |

最终建议不是“一次性押注某个大模型”，而是先把 **capture、canonical transcript、meeting intelligence** 三层边界做稳。音频永远可以重转写，transcript 可以重生成纪要，供应商也可以替换；如果首版把听悟/OpenAI 的原始响应直接扩散到 UI、数据库和招聘评估，后续每次换模型都会成为数据迁移和产品语义问题。
