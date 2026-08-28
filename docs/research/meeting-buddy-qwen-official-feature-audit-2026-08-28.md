# Desktop Meeting Buddy：Qwen 官方实时能力审计与流程优化

调研日期：2026-08-28

范围：仅核对阿里云百炼官方文档，并结合当前 Desktop Meeting Buddy 实现给出建议。本文件是研究结论，不包含运行代码修改。

> 实施更新：同日后续改动已落地建连/滚动上下文、会议级即时热词、词级时间戳、右侧 lookahead 与 1–3 块超时 flush、独立 ASR 麦克风处理轨，以及 Qwen Audio 3 会后 system 轨说话人分离能力。下文“当前差距”保留为实施前审计快照；验证记录见 `docs/verification/meeting-live-asr-upgrade-2026-08-26.md`。

## 结论

继续使用 `qwen-audio-3.0-asr-flash-streaming`。阿里云当前把它列为实时会议首选；它同时支持热词、Prompt 上下文、多语种/方言和默认句/词级时间戳。当前已开启 `semantic_punctuation_enabled: true`、移除显式 `max_sentence_silence: 800`，方向正确。[模型选型](https://help.aliyun.com/zh/model-studio/asr-model)；[实时 API 参数](https://help.aliyun.com/zh/model-studio/fun-asr-client-events)

下一批最值得做的不是换模型，而是：

1. 在 `run-task` 建连时用会议元数据、候选人名、公司名、岗位和关键术语预热上下文；随后滚动更新 `continue-task`。
2. 对会前已知的专有名词增加即时热词 `vocabulary`，先从权重 3–4 开始，不使用超级热词作为默认值。
3. 消费服务端已经默认返回的 `words[]` 时间戳和标点，用于字幕对齐、校正音频窗口和自然段落组织。
4. 用真实会议录音对 `speech_noise_threshold` 做 0.1 步长 A/B，不能凭感觉直接设一个全局值。
5. 保留“实时字幕 + 侧路校正”，但把固定三个 block 的立即提交改成带右侧 lookahead 的自然窗口；会后再按需用 `qwen-audio-3.0-asr-flash-filetrans` 生成最终稿和远端说话人分离。

`special_word_filter`、`multi_threshold_mode_enabled`、敏感词过滤、ITN/顺滑开关都不能解决当前“未知单字幻觉 + 语义未完就进入校正”的核心问题。

## 当前实现与官方能力的差距

当前实时连接为麦克风、系统音频各建一条 WebSocket，显式发送：

- `format: "pcm"`
- `sample_rate: 16000`
- `heartbeat: true`
- `semantic_punctuation_enabled: true`
- 有已知单语种时发送一个 `language_hints`

当前没有发送：

- 建连时的 `input.context`
- `vocabulary` 或 `vocabulary_id`
- `speech_noise_threshold`
- `special_word_filter`

服务端实际会默认返回 `sentence.words[]`，但当前 schema 只消费句级 `begin_time`、`end_time`、`text`、`sentence_end` 和 `sentence_id`，词级时间戳与 `punctuation` 被丢弃。

当前 `continue-task` 只在三个 block 的二次校正成功后发送，而且每次只传本批校正后文本，不是完整滚动窗口。这意味着会议开头没有岗位/人名/术语先验，每组校正前的新句也不能及时帮助后续实时识别。

当前校正按“每三个可见 final block”立即触发，跨两条音轨取三个精确句级片段后拼接；没有等待第 4 个 block 作为右侧语义或音频证据。这正是“第 3 块其实还没说完”的剩余风险。

## 官方实时能力矩阵

| 能力        | `qwen-audio-3.0-asr-flash-streaming` 的官方行为                                                                           | 对 Meeting Buddy 的判断                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 语义断句    | `semantic_punctuation_enabled` 默认 `false`；设为 `true` 后开启语义断句、关闭 VAD 断句。官方明确称其更适合会议。          | 已正确开启，继续保留。                                        |
| 静音断句    | `max_sentence_silence` 默认 1300ms、范围 200–6000ms。语义断句开启时不再作为 `sentence_end` 依据，但过小仍可能影响识别。   | 不要重新传 800ms。                                            |
| 多阈值      | `multi_threshold_mode_enabled` 默认 `false`，仅语义断句关闭时生效，用于避免 VAD 句子过长。                                | 当前完全无效，不要开启。                                      |
| 标点        | `punctuation_prediction_enabled` 默认 `true` 且不支持修改。                                                               | 无需增加配置；不能把它当作可调开关。                          |
| 心跳        | 默认 `false`；`true` 时，在客户端持续发送静音音频的情况下可保持连接。心跳结果 `heartbeat=true`、`sentence_id=0`，应跳过。 | 已开启且已过滤结果；仍需确保停顿时持续送帧。                  |
| 语言提示    | 不设置时自动识别；Qwen-Audio 最多取 4 种，Fun-ASR-Realtime 只取第 1 种。                                                  | 已知中文用 `zh`；真实中英混说可 A/B `zh,en`，未知时不应乱猜。 |
| 噪声阈值    | `speech_noise_threshold` 范围 `[-1,1]`，官方未公开默认值。越靠近 `+1` 越严格，也越可能漏掉轻声；官方要求 0.1 小步测试。   | 可减少噪声触发的孤立词，但不是降噪或结果置信度阈值。          |
| 敏感词      | `special_word_filter` 最多 32 个固定词，可替换为 `*` 或从结果移除；实时接口不传时默认不启用。                             | 不是智能噪声词过滤，不能替代校正层。                          |
| 句/词时间戳 | 默认返回句级毫秒时间戳和 `words[].begin_time/end_time/text/punctuation`，无需开关。                                       | 当前未消费，值得接入。                                        |
| 说话人分离  | 实时 Qwen-Audio/Fun-ASR-Realtime 不支持。                                                                                 | 两条物理音轨只能区分本机/系统；远端多人仍无法区分。           |
| 情绪        | 当前模型不支持。                                                                                                          | 不建议为会议记录迁移模型。                                    |
| 手动断句    | 当前协议只有 `run-task`、`continue-task`、`finish-task`，没有提交当前句的 commit。                                        | 不能在此模型上加一个参数实现手动 block。                      |
| ITN/顺滑    | 当前 Qwen-Audio/Fun 共享实时 API 未暴露可配置的 ITN 或语气词删除参数；标点/文本归一化属于模型内置能力。                   | 不要发送 Paraformer 专属参数；无意义词仍在校正/后处理层处理。 |

参数依据：[客户端事件与完整参数表](https://help.aliyun.com/zh/model-studio/fun-asr-client-events)；[Java SDK 参数表](https://help.aliyun.com/zh/model-studio/fun-asr-realtime-java-sdk)；[服务端结果字段](https://help.aliyun.com/zh/model-studio/fun-asr-server-events)；[实时识别用户指南](https://help.aliyun.com/zh/model-studio/real-time-speech-recognition-user-guide)

## 上下文：优先级最高

### 官方契约

`run-task.payload.input.context` 可在连接开始时注入上下文；任务运行中可发送同一 `task_id` 的 `continue-task`，更新后续识别所用上下文。官方描述的是“辅助后续识别”，没有承诺回溯改写已完成句子。[客户端事件](https://help.aliyun.com/zh/model-studio/fun-asr-client-events)；[上下文增强](https://help.aliyun.com/zh/model-studio/improve-asr-accuracy)

上下文的关键限制：

- `user` + `input_text`：前轮语音识别结果或领域词表。
- `assistant` + `text`：前轮 LLM 回复，可省略；会议转写不需要伪造 assistant 消息。
- `input_text` 和 `text` 各最多 5 条，超出只保留最近 5 条。
- 每轮 user + assistant 文本合计最多 400 字符，超出从末尾截断。
- 必须按轮次排列，且一轮内 user 在 assistant 之前。
- 支持当前 Qwen-Audio 主模型、`fun-asr-realtime` 和 `fun-asr-realtime-2025-11-07`；不是所有 Fun 快照都支持。

### 推荐组织方式

建连时发送一条不超过 400 字符的稳定领域上下文，内容按高价值排序：

`候选人姓名 / 面试官姓名 / 公司与产品名 / 岗位名 / 技术栈与缩写 / 本次会议议题`

会议中，每个 final 句或短 debounce 后发送滚动上下文，而不是等满三个 block 且校正完成：

- 保留一条稳定术语清单。
- 再带最近 3–4 条最终句，优先使用保守校正后的文本。
- 总量保持在官方限制内，不传长 JD 原文。
- 不把 LLM 润色、总结或推测内容回灌，避免确认偏差。

## 热词：第二优先级

阿里云提供两类免费热词：[提升识别准确率](https://help.aliyun.com/zh/model-studio/improve-asr-accuracy)

- `vocabulary_id`：预编译词表，适合稳定的公司、产品、岗位和行业词汇。创建时 `target_model` 必须与识别模型完全一致，且热词管理与识别必须同账号；否则可能不生效。
- `vocabulary`：请求内即时热词，仅 Qwen-Audio-3.0 系列支持，最适合从单场会议的候选人、JD 和参会者信息生成。

限制与调优：

- 普通权重范围 1–5，官方建议从 4 起测；过高会把近音普通词错改成热词。
- 权重 50 是超级热词，最多 50 个，不应作为常规默认值。
- Qwen-Audio 每个预编译列表或单次即时请求最多 2000 词；每账号最多 10 个预编译列表。
- 含非 ASCII 的词最多 15 字符；纯 ASCII 最多 7 个空格分隔片段。
- 设置 `language_hints` 后，只有匹配指定语种的带 `lang` 预编译热词生效。
- 新加坡地域的子业务空间暂不支持热词。

官方文档在“同时设置两类热词”上存在冲突：准确率总览称 Qwen-Audio 会合并两类词表，超过 2000 后随机取 2000；WebSocket/SDK 参数表仍称“同时配置时仅即时热词生效”。生产上应避免同时传两种，或先用真实请求确认地域和端点的实际行为。[准确率总览](https://help.aliyun.com/zh/model-studio/improve-asr-accuracy)；[WebSocket 参数](https://help.aliyun.com/zh/model-studio/fun-asr-client-events)

## 单个无意义词：上游抑制与下游删除应并存

当前保守删除机制仍有必要。官方没有提供“智能删除无意义词”开关：

- `speech_noise_threshold` 只影响 VAD 对语音/噪声的判断，可能降低敲击声、风声等触发转写的概率；它不能判断一句文本是否有语义，也不能恢复被噪声污染的人声。[实时参数](https://help.aliyun.com/zh/model-studio/fun-asr-client-events)
- `special_word_filter` 只能匹配事先列出的固定词，最多 32 个。把“嗯、好、对”等放进去会删除真实会议内容。[实时敏感词过滤](https://help.aliyun.com/zh/model-studio/real-time-speech-recognition-user-guide)
- `disfluency_removal_enabled` 和 `inverse_text_normalization_enabled` 是 Paraformer 暴露的能力，不在当前 Qwen-Audio/Fun 共享 API 参数中。[Paraformer 实时参数](https://help.aliyun.com/zh/model-studio/paraformer-client-events)

推荐先记录默认配置基线，再对 `speech_noise_threshold` 朝更严格方向按 0.1 一档测试。每档至少覆盖安静、键盘/风扇、远场、轻声、重叠发言五类音频；出现轻声漏字即回退。官方没有公布默认值，因此不能把某个具体起始数值描述为“默认”。

## 时间戳与校正窗口

服务端已经默认输出：

- 句级 `sentence.begin_time/end_time`
- 词/词片段级 `words[].begin_time/end_time/text/punctuation`

文档虽称“字级”，示例会把“知道”作为一个 `words` 元素，因此实现不能假定每个元素恰好一个汉字。[实时时间戳](https://help.aliyun.com/zh/model-studio/real-time-speech-recognition-user-guide)；[返回示例](https://help.aliyun.com/zh/model-studio/fun-asr-server-events)

建议用途：

1. 保存词级时间戳，支持点击字幕定位、关键词高亮和后续人工编辑。
2. 校正音频不要把服务端 block 当作绝对不可跨越的语义边界；根据末尾标点和词级时间戳，为目标窗口保留小量前后 padding。
3. 仍用 compare-and-set 只回填目标 block，padding 只提供听觉证据，不能把相邻内容复制进目标。
4. 统计末尾无句末标点、极短 block、超长 block 的比例，作为断句质量指标。

## 固定三个 block 校正的流程优化

### P0：最小风险

保留“三个目标 block”的回填契约，但延迟一个自然事件再发起：

- 第 1–3 块在第 4 个 final 或新的右侧 partial 到达后校正。
- 没有新内容时用 0.8–1.5 秒 lookahead 超时触发。
- 暂停、停止、音轨断开时立即 flush 剩余目标。
- 第 4 块只作为右侧文本/音频证据，不进入 1–3 的回填结果。

这能直接缓解“第三块是半句话”的问题，又不需要立刻改变现有三个 ID 的原子回填协议。

### P1：从数量批次升级为自然窗口

逐步把“恰好三个 block”改为“自然语义窗口 + 上限”：

- 说话人/音轨切换、明确句末标点、短暂静音可作为优先边界。
- 以总音频秒数、总字符数和最大等待时间作为硬上限。
- 每个窗口保留一个右侧 block 或 partial 作为 lookahead。
- 不把麦克风与系统音轨的重叠语音简单串成一个时间上连续的说话人；需要保留 track 和原始墙钟顺序。

### P2：会后最终稿

实时 Qwen-Audio 和 Fun-ASR-Realtime 都不支持说话人分离。官方推荐非实时 `qwen-audio-3.0-asr-flash-filetrans`：支持热词、上下文、时间戳和说话人分离，最长 12 小时/2GB，启用分离时建议音频不超过 2 小时。[模型选型](https://help.aliyun.com/zh/model-studio/asr-model)；[非实时识别](https://help.aliyun.com/zh/model-studio/non-realtime-speech-recognition-user-guide)

Meeting Buddy 已有本机麦克风/系统音频双轨，因此实时阶段不需要模型猜这两个来源；但系统音频中有多个远端参会者时，会后可对系统轨或最终混音做 diarization。最终稿应作为异步增强，不能阻塞录制保存或覆盖未经比较的实时人工编辑。

## 不建议为了单项能力换主模型

### Qwen3-ASR-Flash-Realtime

它支持 7 类情绪和客户端 manual commit，但当前不返回时间戳，官方模型表也列为不支持热词/上下文精度增强。Manual 模式适合用户明确点击发送的短语音，不适合长会议主链路。不要仅为了“手动断句”迁移。[实时交互模式与时间戳限制](https://help.aliyun.com/zh/model-studio/real-time-speech-recognition-user-guide)；[模型选型](https://help.aliyun.com/zh/model-studio/asr-model)

### Fun-ASR-Realtime

`fun-asr-realtime` 稳定别名当前等同 `2025-11-07`；该快照支持上下文。更新日期更晚的 `2026-02-28` 不是当前会议流程的自然升级：支持语种更少，且不在 `continue-task` 支持列表中。日期更新不等于更适合当前产品。[实时支持模型](https://help.aliyun.com/zh/model-studio/real-time-speech-recognition-user-guide)；[客户端事件支持范围](https://help.aliyun.com/zh/model-studio/fun-asr-client-events)

### Paraformer-Realtime

它有可配置的语气词过滤和 ITN，但需要重新评测专有名词、上下文、方言和总体准确率；`paraformer-realtime-8k-v2` 的情绪输出还要求关闭语义断句。它更适合作为专项 benchmark，不是当前默认替代。[Paraformer 参数](https://help.aliyun.com/zh/model-studio/paraformer-client-events)；[实时情绪限制](https://help.aliyun.com/zh/model-studio/real-time-speech-recognition-user-guide)

## 传输与音频质量

当前使用 WebSocket。阿里云官方协议对比称 WebSocket 不内置回声消除/降噪，需要客户端处理；AOQ 内置弱网对抗、AEC 和降噪，但实时语音识别的 AOQ 端侧平台主要是 Android、iOS、HarmonyOS，不是当前 Electron Desktop 的小改动。[Realtime API 协议对比](https://help.aliyun.com/zh/model-studio/realtime-api-overview)

因此 Desktop 更实际的方向是：

- 继续在采集侧做 AEC、噪声抑制和回声/串音测试。
- 保持两条物理音轨，避免系统声回灌到麦克风后重复转写。
- 音频包维持约 100ms、1–16KB，避免首包过大或过碎调度；以 SDK 官方建议为基线。[Python SDK](https://help.aliyun.com/zh/model-studio/fun-asr-realtime-python-sdk)
- 对断线、积压、静音心跳、丢帧和重连后的 block 连续性持续观测。

## 建议的实施顺序与验收指标

### 第一阶段：不改模型

1. 建连上下文预热 + 滚动 `continue-task`。
2. 会议级即时热词，权重从 3–4 A/B。
3. 消费并保存 `words[]`。
4. 三 block 增加右侧 lookahead 与超时 flush。

验收指标：专有名词错误率、1–2 字异常 block 比例、校正改字率、删除率、第三块被后续补全的比例、从发声到 final/校正完成的 P50/P95 延迟。

### 第二阶段：有数据后调参

对 `speech_noise_threshold` 做真实录音离线/灰度 A/B；按音频环境、音轨和说话距离分层，不只看总 WER。记录轻声漏识别率与噪声幻觉率的权衡。

### 第三阶段：最终稿增强

会后异步 Filetrans + 可选说话人分离，和实时稿做差异评测；明确“实时可读”与“最终可归档”是两套时延/质量目标。

## 官方资料

- [语音识别模型选型](https://help.aliyun.com/zh/model-studio/asr-model)
- [实时语音识别用户指南](https://help.aliyun.com/zh/model-studio/real-time-speech-recognition-user-guide)
- [Qwen-Audio/Fun-ASR 实时客户端事件](https://help.aliyun.com/zh/model-studio/fun-asr-client-events)
- [Qwen-Audio/Fun-ASR 实时服务端事件](https://help.aliyun.com/zh/model-studio/fun-asr-server-events)
- [Qwen-Audio/Fun-ASR Python SDK](https://help.aliyun.com/zh/model-studio/fun-asr-realtime-python-sdk)
- [Qwen-Audio/Fun-ASR Java SDK](https://help.aliyun.com/zh/model-studio/fun-asr-realtime-java-sdk)
- [热词与上下文增强](https://help.aliyun.com/zh/model-studio/improve-asr-accuracy)
- [非实时语音识别](https://help.aliyun.com/zh/model-studio/non-realtime-speech-recognition-user-guide)
- [Realtime API 协议对比](https://help.aliyun.com/zh/model-studio/realtime-api-overview)
- [Paraformer 实时客户端事件](https://help.aliyun.com/zh/model-studio/paraformer-client-events)
