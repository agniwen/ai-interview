# LiveKit Agent 使用 Qwen/DashScope 替换 ElevenLabs STT 可行性

调研日期：2026-09-03

证据边界：LiveKit 官方文档与官方仓库、阿里云百炼官方文档、ElevenLabs 官方文档，以及本仓库当前源码。本文包含切换前的可行性研究和实施后的仓库状态；没有使用真实账号执行 DashScope 或 ElevenLabs 在线音频测试。

## 结论

**可行，本仓库现已默认使用 Qwen-Audio-3.0-ASR-Flash-Streaming；但这不是把 LiveKit 的模型 ID 从 ElevenLabs 改成 Qwen 这么简单。**

LiveKit Inference 的当前 STT 模型清单和官方插件清单都没有 Qwen、DashScope 或 Alibaba Cloud，因此 Qwen 不能通过 `stt="qwen/..."` 或官方 `livekit.plugins.qwen.STT()` 直接启用。LiveKit 官方支持自定义 STT 节点/实现，也允许把插件实例传给 `AgentSession`，所以正确路径是让 Agent 进程直接连接 DashScope WebSocket，并把服务端事件转换成 LiveKit 的 `SpeechEvent`。[LiveKit STT 模型与插件清单](https://docs.livekit.io/agents/models/stt/)；[LiveKit 插件模型用法](https://docs.livekit.io/agents/integrations/plugins/)；[LiveKit Python STT 接口](https://docs.livekit.io/reference/python/livekit/agents/stt/index.html)

本仓库实施后的状态：

1. LiveKit 面试 Agent 已从 ElevenLabs `scribe_v2` 切换到项目自维护的 [`aliyun_stt.py`](../../apps/livekit-agent/src/aliyun_stt.py)，默认模型为 `qwen-audio-3.0-asr-flash-streaming`。原配置中的 `scribe_v2` 在锁定的 LiveKit Agents 1.6.7 插件里不是原生 realtime 模型；只有 `scribe_v2_realtime` 才声明 streaming。[LiveKit Agents 1.6.7 ElevenLabs STT 源码](https://github.com/livekit/agents/blob/livekit-agents%401.6.7/livekit-plugins/livekit-plugins-elevenlabs/livekit/plugins/elevenlabs/stt.py)
2. 适配器已补齐 `task-started` 握手、`task-failed` 错误映射、连接超时与清理、可配置 Workspace endpoint，并把 Qwen 的中间/最终结果和字级时间戳映射为 LiveKit 事件。Agent 默认使用官方 1300 ms VAD 断句阈值。

当前代码切换和协议适配已经完成；剩余风险集中在真实中文面试语料、部署地域、账号配额和在线故障恢复验证。不能把单元测试通过等同于生产效果已经优于 ElevenLabs。

## 1. LiveKit 原生支持情况

### 1.1 LiveKit Inference 没有 Qwen

截至调研日，LiveKit Inference 的 STT 列表包含 Deepgram、AssemblyAI、Cartesia、Gemini、Speechmatics 和 ElevenLabs 等，但没有 Qwen/DashScope。LiveKit 说明 Inference 由 LiveKit Cloud 管理凭证、计费和限流；不在 Inference 内的 provider 应走插件或自定义集成。[LiveKit STT overview](https://docs.livekit.io/agents/models/stt/)

这意味着：

- 不能写 `stt="qwen-audio-3.0-asr-flash-streaming:zh"`；
- Qwen 调用费用、DashScope 限流和 API Key 由本项目负责；
- STT 音频会由 Agent 进程直接发往阿里云，不会经 LiveKit Inference 代理。

### 1.2 LiveKit 官方插件也没有 Qwen

LiveKit 当前列出的开源 STT 插件包括 Amazon、Azure、Deepgram、ElevenLabs、Google、OpenAI、Speechmatics 等，没有 Alibaba/Qwen。官方文档明确欢迎为未覆盖 provider 自行贡献插件。[LiveKit STT plugin list](https://docs.livekit.io/agents/models/stt/#plugins)

因此仓库里的 `aliyun_stt.py` 应被视为**项目自维护适配器**，不是 LiveKit 官方插件。它需要随 `livekit-agents` 升级独立做兼容测试。

### 1.3 自定义 STT 接口足以承载 Qwen

LiveKit 的 Python STT 抽象支持声明 `streaming`、`interim_results`、`aligned_transcript`、`diarization` 等能力；`SpeechData` 可携带整句起止时间、`TimedString` 字级时间戳和 `speaker_id`。`AgentSession` 接受 `stt.STT` 实例，流式实现通过 `SpeechStream` 接收音频帧并产出 `START_OF_SPEECH`、`INTERIM_TRANSCRIPT`、`FINAL_TRANSCRIPT`、`END_OF_SPEECH` 事件。[LiveKit Python STT reference](https://docs.livekit.io/reference/python/livekit/agents/stt/index.html)；[LiveKit standalone streaming example](https://docs.livekit.io/agents/models/stt/#standalone-usage)

仓库适配器已按这个接口声明原生流式、中间结果和字级对齐，并把 Qwen 的毫秒时间戳转换为 LiveKit 秒单位：[`aliyun_stt.py`](../../apps/livekit-agent/src/aliyun_stt.py#L129-L155)、[`aliyun_stt.py`](../../apps/livekit-agent/src/aliyun_stt.py#L321-L390)。

## 2. Qwen-Audio-3.0-ASR-Flash-Streaming 能力核验

### 2.1 实时输入输出

阿里云把 `qwen-audio-3.0-asr-flash-streaming` 定位为低延迟、高并发实时交互模型，基于 WebSocket 双向流式传输，适用于实时字幕、语音助手和会议转写；音频可以边发送、文本边返回。[模型页](https://help.aliyun.com/zh/model-studio/qwen-audio-3-0-asr-flash-streaming)；[语音识别选型](https://help.aliyun.com/zh/model-studio/asr-model/)

WebSocket 服务端 `result-generated` 事件同时覆盖：

- `sentence_end=false`：当前句的中间结果；
- `sentence_end=true`：最终结果；
- `sentence_begin=true`：新句首个事件；
- `begin_time` / `end_time`：句级毫秒时间戳；
- `words[].begin_time` / `end_time` / `text` / `punctuation`：字级时间戳与标点。

来源：[Qwen-Audio Streaming 服务端事件](https://help.aliyun.com/zh/model-studio/fun-asr-server-events)。这些字段与 LiveKit 的 interim/final 和 aligned transcript 契合，不需要修改 Agent 的上层 LLM/TTS 会话协议。

### 2.2 音频格式、采样率和分片

Qwen-Audio Streaming 接受单声道二进制流，支持 `pcm`、PCM 编码的 `wav`、`mp3`、Ogg 封装的 `opus`/`speex`、`aac` 和 AMR-NB；该系列支持任意采样率，且实时音频时长不限。[阿里云音频规格](https://help.aliyun.com/zh/model-studio/asr-model/#音频规格)

阿里云 Python SDK 文档建议每次发送约 100 ms、1 KB 到 16 KB 的音频。[Python SDK 双向流式说明](https://help.aliyun.com/zh/model-studio/fun-asr-realtime-python-sdk)

仓库适配器选择 16 kHz、单声道、PCM，并通过 LiveKit `SpeechStream(sample_rate=16000)` 要求框架重采样，再以 100 ms 一帧发送，和官方建议一致：[`aliyun_stt.py`](../../apps/livekit-agent/src/aliyun_stt.py#L50-L59)、[`aliyun_stt.py`](../../apps/livekit-agent/src/aliyun_stt.py#L209-L221)、[`aliyun_stt.py`](../../apps/livekit-agent/src/aliyun_stt.py#L248-L268)。现有单测只证明声明采样率和事件映射，不等于真实音质或端到端延迟已验证。

### 2.3 中文、方言、热词与上下文

该模型支持普通话、粤语、吴语、闽南语、客家话等中文方言和多种地区口音，也支持英语、日语、韩语等多语种。[模型语言列表](https://help.aliyun.com/zh/model-studio/asr-model/#qwen-audio-3-0-asr-flash-streaming)

它还支持：

- `language_hints`，最多 4 种语言；不设置可自动识别；
- 预编译热词 `vocabulary_id`；
- 即时热词 `vocabulary`，两类合计最多 2,000 个；
- 初始和运行中的对话上下文，适合把岗位名、公司名、技术栈和当前问题送入识别器。

来源：[客户端事件与请求参数](https://help.aliyun.com/zh/model-studio/fun-asr-client-events)；[提升识别准确率](https://help.aliyun.com/zh/model-studio/improve-asr-accuracy)。

当前 `aliyun_stt.py` 只实现了固定 `language_hints=["zh"]` 和可选 `vocabulary_id`，没有实现即时热词和 `continue-task` 上下文更新。因此它能复现 Desktop 的基础识别模型，但还没有利用 Qwen 相对适合面试域词汇的全部能力。

### 2.4 断句、VAD 与延迟

Qwen 支持两种断句方式：

- `semantic_punctuation_enabled=false`（默认）：VAD 断句，延迟较低，适合交互；
- `semantic_punctuation_enabled=true`：语义断句，准确性较高，适合会议转写，但关闭 VAD 断句。

VAD 模式下 `max_sentence_silence` 官方默认 1300 ms、范围 200–6000 ms；`speech_noise_threshold` 可在 -1 到 1 之间调整语音/噪声判定，但官方要求以 0.1 小步真实测试。[客户端参数](https://help.aliyun.com/zh/model-studio/fun-asr-client-events)

仓库适配器使用 VAD 模式，并将 `max_sentence_silence` 保持为官方默认的 1300 ms。它仍需和 LiveKit 现有 Silero VAD、audio turn detector、dynamic endpointing 一起做真实对话测试。Desktop 字幕“看起来准确”是积极证据，但 Agent 的 turn-taking 对 final 时机更敏感，不能只比较字幕文本。

阿里云公开了 SDK 的 `get_first_package_delay()` 和 `get_last_package_delay()` 指标接口，但官方资料没有给出该模型的可承诺 p50/p95 首字或最终延迟数值；只有“低延迟”的产品描述。[Python SDK 指标示例](https://help.aliyun.com/zh/model-studio/fun-asr-realtime-python-sdk)。因此本文不能用官方资料断言它一定比 ElevenLabs 快多少，必须在实际部署地域测量。

### 2.5 说话人分离

`qwen-audio-3.0-asr-flash-streaming` **不支持实时说话人分离**。阿里云把说话人分离放在非实时的 `qwen-audio-3.0-asr-flash-filetrans` 或 Fun-ASR 文件模型中。[阿里云语音识别选型](https://help.aliyun.com/zh/model-studio/asr-model/#说话人分离)

LiveKit 的 `MultiSpeakerAdapter` 也要求底层 STT 明确声明 `diarization=True`，其官方支持列表没有 Qwen。[LiveKit speaker diarization](https://docs.livekit.io/agents/models/stt/#speaker-diarization-and-primary-speaker-detection)

对当前 AI 面试 Agent，这通常不是阻塞项：候选人的 LiveKit participant audio track 本身就是单一远端输入，Agent 自己的 TTS 不需要通过同一 STT 再分离。但如果未来把同一会议室麦克风中的多人混音交给 Agent，Qwen realtime 无法直接给出“谁说了什么”；应继续用独立轨道，或会后用 filetrans 做说话人分离。

## 3. 凭证、地域、限流与价格

### 3.1 凭证

Agent 端属于可信服务端，应该通过环境变量注入北京地域的 `DASHSCOPE_API_KEY`，不要把永久 Key 下发给客户端。阿里云也要求环境变量或安全存储，API Key、endpoint 和模型必须属于同一地域。[获取 API Key](https://help.aliyun.com/zh/model-studio/get-api-key)；[地域与域名](https://help.aliyun.com/zh/model-studio/singapore-regional-access-information)

如果以后让 Desktop/浏览器直连，阿里云提供 1–1800 秒的临时 API Key，继承永久 Key 权限并自动过期；仓库 Desktop 当前正是由后端签发临时 Key，而不是暴露永久 Key：[`qwen-realtime.ts`](../../apps/server/src/server/routes/meetings/transcription/providers/qwen-realtime.ts#L37-L96)。[阿里云临时 API Key](https://help.aliyun.com/zh/model-studio/application-obtain-temporary-authentication-token)

### 3.2 地域和接入域名

Qwen-Audio Streaming 提供华北 2（北京）和新加坡。阿里云推荐生产使用业务空间专属域名：

- 北京：`wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference`
- 新加坡：`wss://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api-ws/v1/inference`

专属域名用于更高并发承载、网络隔离和较低延迟；旧的 `dashscope.aliyuncs.com` 仍可用。[阿里云 Python SDK 接口地址](https://help.aliyun.com/zh/model-studio/fun-asr-realtime-python-sdk)

当前仓库适配器默认使用北京共享域名 `wss://dashscope.aliyuncs.com/api-ws/v1/inference`，也可通过 `DASHSCOPE_STT_BASE_URL` 和 `DASHSCOPE_WORKSPACE_ID` 配置业务空间专属域名。上线时应确保 Key、Workspace 和域名属于同一地域。

### 3.3 限流

官方模型页给出北京和新加坡均为 1200 RPM；通用限流页以“提交作业接口 RPS”表达为 20 RPS，两者等价。每个实时会话通常占一个长 WebSocket 任务，仍需要用并发面试压测验证连接数、重连峰值和账号实际配额。[模型限流页](https://help.aliyun.com/zh/model-studio/qwen-audio-3-0-asr-flash-streaming)；[百炼限流总表](https://help.aliyun.com/zh/model-studio/rate-limit#qwen-audio-3-0-asr-flash-streaming)

### 3.4 价格

阿里云按输入音频秒数计费、输出不计费：

- 北京：0.00033 元/秒，即 **1.188 元/小时**；
- 新加坡：0.00066 元/秒，即 **2.376 元/小时**；
- 北京有开通后 90 天内 36,000 秒（10 小时）免费额度，新加坡无该免费额度。

来源：[阿里云模型价格](https://help.aliyun.com/zh/model-studio/model-pricing#qwen-audio-3-0-asr-flash-streaming)。

ElevenLabs 官方当前列出的 Scribe v2 为 0.22 美元/小时，Scribe v2 Realtime 为 0.39 美元/小时。[ElevenLabs API pricing](https://elevenlabs.io/pricing/api?price.section=speech_to_text)。切换前仓库使用的是前者。由于币种不同、税费和合同折扣未知，本文不做汇率换算；Qwen 的直接收益首先是中国网络路径和供应商本地化，不应只按标价判断。

## 4. LiveKit Cloud 与自托管差异

Qwen 自定义 STT 是 Agent 进程到 DashScope 的出站连接，**与 LiveKit SFU 是 Cloud 还是 self-hosted 没有接口兼容性差异**；两种情况下都可以使用同一个 `stt.STT` 实例。LiveKit 官方把 Agent 定义为可部署到 LiveKit Cloud 或任意自定义环境的普通 Python/Node 进程。[LiveKit Agents introduction](https://docs.livekit.io/agents/)

但两者的网络拓扑和凭证运维不同：

| 方案 | Agent 到 Qwen 的路径 | 凭证 | 对国内延迟的判断 |
| --- | --- | --- | --- |
| LiveKit Cloud Agent | LiveKit Cloud Agent region → 北京/新加坡 DashScope | `DASHSCOPE_API_KEY` 作为 LiveKit Cloud secret 注入 | 兼容，但当前官方 Agent deployment regions 只有美国东部、德国和印度，没有中国大陆或新加坡；连接北京要跨境，不能仅凭更换 provider 保证低延迟 |
| 自托管 Agent + LiveKit Cloud SFU | 自选 Agent 机房 → DashScope；媒体仍由 LiveKit Cloud SFU 送到 Agent | 自己的 secret/Kubernetes 管理 | 若 Agent 部署在中国大陆并使用北京专属域名，最有机会缩短 Agent→STT 路径；仍需测量 participant→LiveKit→Agent 的媒体路径 |
| 自托管 Agent + 自托管 LiveKit | 完全自选媒体和 Agent 地域 → DashScope | 全部自管 | 网络控制最大，但运维成本也最高；不是完成本次 STT 替换的必要条件 |

LiveKit 当前列出的 Cloud Agent regions 是 `us-east`、`eu-central`、`ap-south`；实时媒体的 Asia region group 是日本和新加坡，也不包含中国大陆。[LiveKit regions](https://docs.livekit.io/deploy/admin/regions/endpoints/#agent-deployment-regions)。LiveKit Cloud secret 会加密存储并在容器运行时以环境变量注入。[LiveKit secret management](https://docs.livekit.io/deploy/agents/secrets/)

因此，若“国内慢”主要来自 ElevenLabs 跨境 API，Qwen 北京大概率能改善供应商段；若 Agent 本身仍在境外，改善幅度取决于境外 Agent 到北京 DashScope 的真实链路。建议把 Agent 地域、DashScope endpoint、首个 interim、final、整轮 response start 分别打点，不要只记录总轮次延迟。

## 5. 当前实现状态与剩余验证

现有实现具备 LiveKit STT 子类、16 kHz PCM、100 ms 分片、interim/final、句级和字级时间戳、心跳过滤、中文语言提示、API Key 环境变量，以及协议状态机和配置测试。

已完成的切换工作：

1. `_build_session()` 默认接入 Qwen streaming STT，并保留模型、断句、词表、Workspace 和 endpoint 环境变量配置。
2. 收到 `task-started` 后才发送音频；`task-failed` 映射为 LiveKit API 错误；连接超时、关闭和任务取消都有显式处理。
3. 默认断句阈值为官方的 1300 ms，Qwen 字级时间戳声明为 LiveKit word-aligned transcript。
4. 单测覆盖请求参数、事件映射、采样率、握手顺序、错误映射和 Agent Session 接线。

生产前仍需完成：

1. **真实在线韧性验证**：覆盖网络断开、重连、Agent shutdown、未完成 final、限流和鉴权失败；当前测试使用 fake WebSocket，没有真实账号调用证据。
2. **地域和容量验证**：使用同地域 Workspace 专属域名，测量真实并发连接、首个 interim、final 和整轮延迟。
3. **校准 turn-taking**：重点检查“嗯/呃”、长停顿、自我修正、技术英文、数字与人名，确认 1300 ms 断句与 LiveKit dynamic endpointing 配合符合面试节奏。
4. **补齐 provider 级监控**：记录连接建立、首个 interim、final、错误码、重连次数和计费音频时长。
5. **可选精度增强**：把岗位名、公司名、面试问题和技术词表映射为即时热词/上下文。

## 6. 建议的验证门槛

先用 20–30 段真实、已脱敏的中文面试语音做离线重放，再做至少 10 场真实网络条件下的双路 A/B：

- 文本：中文字符错误率、技术词/人名/数字准确率、空转写和幻觉次数；
- 延迟：WebSocket connect、首个 interim、final、LLM 首 token、TTS 首音频；
- turn-taking：过早截断、错误打断、长停顿漏结束、短填充词触发；
- 稳定性：连接失败率、重连成功率、429/鉴权/5xx、会话尾部 final 丢失；
- 成本：阿里云 usage duration 与本地输入音频时长对账；
- 地域：至少比较“现有 Agent region → 北京共享域名”和“就近自托管 Agent → 北京 Workspace 专属域名”。

首版可接受的决策标准应是：Qwen 在中文关键字段准确率不低于现有 ElevenLabs、p95 final-to-LLM 延迟明显下降、无新增 turn 截断问题、错误率和重连表现达到同等水平。没有真实在线测试前，结论只能是“接口与现有代码层面可行”，不能宣称“生产效果已优于 ElevenLabs”。
