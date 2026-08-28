# Desktop 实时字幕升级与自然窗口联合校正

## 当前行为

- 实时模型为 `qwen-audio-3.0-asr-flash-streaming`，开启服务端语义断句，不再显式使用 800ms VAD 静音作为 block 封口依据。校正候选最多三个 final block；只有看到右侧 partial/final 作为后文时才提交前三块，没有右侧内容则在 1.2 秒 lookahead 后提交余下 1–3 块。重复完成事件不重复触发。
- 每组只发一个 IPC 命令。主进程在 capture 会话层找到所选 1–3 个 block 原连接的 PCM，按 block 顺序拼成一份 16 kHz、单声道、16-bit WAV。只调用一次 `qwen-audio-3.0-asr-flash` 整体识别，再调用一次 `deepseek-v4-flash-0731`，不再逐块或分音轨请求 ASR。
- LLM 输入包含整段重新识别结果、所选 1–3 个 block 的原文/音轨/拼接后时间边界、已有校正前文，以及 ASR 期间新到的实时后文。前后文分别最多五个 block，每个最多 2000 字符。使用 JSON 输出模式，要求保守纠错、不编造、不总结，输出与输入数量和顺序一致的原 ID 与对应文本。
- 对返回 ID、数量、文本逐项校验；Renderer 比较所有原稿后一次性回填整批 block。任何一个原稿被更新、旧 section 被关闭或模型返回不完整，都不部分覆盖。单字孤立噪声误识别可以由模型返回 `null` 删除；代码仅允许删除一个字符、不是常见有效短回应、且在二次 ASR 全文中没有对应内容的 block，其他删除提议一律回退原文。成功后保存 `originalText` 与组合模型名 `correctionModel`，被删除 block 不进入草稿或后续上下文，临时 `correcting` 不持久化。
- 提交批次时立即在参与 block 的正文前显示渐变 AI 星星，排队、ASR 和 LLM 期间保持。使用本地内联 SVG，不依赖远程图标加载，也不再通过负向 left 定位。固定前导位置避免状态变化时文字横跳。
- 回填时隐藏星星，随后每块播放一次 Glimm prism 扫光；模型确认无需改字时也播放。文本 block 与 canvas 都为直角。失败、取消、历史重挂载或重复事件不重播。减少动态效果和 WebGL 不可用时安全降级。

## 生命周期与资源

- 校正是独立侧路，不阻塞录制或保存，不读取/修改录音 spool，不代理 PCM 到业务 Backend。永久 API Key 不进入 Desktop，两个 HTTP 阶段均使用现有后端签发的临时凭证。
- 每轨保留最近 90 秒 PCM（2.88 MB）和最多 30 个完成 block 的时间元数据；单块最多 60 秒。任一片段缺失则整组保留原文，不用不完整音频纠正该批 block。
- 每个 capture 最多一个在途批次、四个待处理批次；淘汰批次清理星星。每阶段 HTTP 超时 45 秒。任一参与音轨断开或暂停时取消对应批次，忽略迟到结果；停止后清空缓存。
- 草稿去重按 block ID，主进程按 batch ID 去重。ASR 校正版作为后续实时识别上下文，重复 provider final 不覆盖已校正的历史上下文。
- 校正增加 ASR 音频时长费用和 LLM token 费用；尚未评测真实会议语料的准确率，不声称准确率提升比例。

## 2026-08-26 本次验证

- 用阿里云公开示例 `hello_world_female2.wav` 拼接三次，经过本次实际校正 worker：ASR HTTP 200、DeepSeek HTTP 200，总计两次推理请求，成功返回三个原 block ID，并将示例原稿中的“阿里巴吧”改为“阿里巴巴”。未上传用户会议录音。初次接口尝试返回了不符合契约的对象并被拒绝；补充 JSON 输出模式和明确的 text 输入后验证通过。
- 相关八个测试文件、83 个测试通过。覆盖精确裁音/环形缓冲、合并顺序、一次 ASR 加一次 LLM、缺失片段/错误 JSON/不匹配 ID、队列上限、ASR/LLM 取消、跨音轨断开、实时后文、立即显示星星、原稿版本比较、整组回填、失败清理、暂停恢复、preload CSP 与 MessagePort、单次 Glimm 及资源释放。
- 提交前将 `meeting-audio-player.test.tsx` 的旧 `rounded-md` 断言同步为当前 composer 的 `rounded-xl`，不改 UI 行为。Desktop 全量 53 个测试文件、240/240 个测试通过，两套 TypeScript 检查和仓库 `bun run fix` 通过。
- Desktop 两套 TypeScript 检查和生产构建通过，Shared 类型检查通过，本次文件 lint/格式检查通过。
- 使用真实 `LiveTranscriptDraft` 状态机、字幕组件、`MeetingRecordingSessionLayout`、Desktop CSS 和 CSP 搭建独立预览，输入为模拟字幕。明暗主题下均能看到三个 16px 渐变星星，位置在 block 内文字前；回填后星星数为 0、canvas 数为 3，canvas 左偏差 0px、宽度 720px、圆角 0px。动画结束 canvas 为 0，重复结果不重播。临时预览文件已删除。
- 没有手动停止、暂停或重启用户正在进行的录制。上述预览验证不等同于在用户当前 Electron 进程内跑完真实录制。

## 2026-08-28 语义断句与噪声 block 清理验证

- 回归测试先确认旧行为会继续发送 `max_sentence_silence: 800`、拒绝删除结果并把 `null` 留成空文本，随后验证新行为开启 `semantic_punctuation_enabled`、不再发送该 800ms 阈值，并从实时草稿中真正移除允许删除的 block。
- 校正测试覆盖“字”这类单字噪声删除，以及模型试图删除“对”和未说完长句时由代码恢复原文。常见确认、否定、问候、语气词等短回应位于保护集合；删除仍需二次 ASR 全文不包含原词。
- Desktop 全量 59 个测试文件、255/255 个测试通过，两套 TypeScript 检查与生产构建通过；Shared 全量 49 个测试文件、496/496 个测试及类型检查通过；涉及文件格式检查和 `git diff --check` 通过。

## 生效

本次改动涉及主进程、preload 和 renderer：先保存/结束当前录制，再完整重启 Desktop，开发环境重新执行 `make desktop-dev`。仅刷新页面无法更新旧的 IPC 协议。

此前的实时模型升级需 Backend 支持新模型授权和草稿两个可选字段；显式设置了 `MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL` 的环境仍以该变量为准。旧 `qwen3-asr-flash-realtime` 协议保留，但不启用本次校正侧路。

## 官方依据

- [实时客户端协议](https://help.aliyun.com/zh/model-studio/fun-asr-client-events)
- [实时服务端协议](https://help.aliyun.com/zh/model-studio/fun-asr-server-events)
- [实时识别参数与语义断句](https://help.aliyun.com/zh/model-studio/fun-asr-realtime-java-sdk)

## 2026-08-28 上下文、自然校正窗口与音频质量增强

- 招聘记录关联录制会从开始页已加载的数据生成一条不超过 400 字的会议上下文，并把候选人、岗位、部门和技能去重后作为最多 30 个、权重 4 的即时热词；提示只进入当前实时 ASR 会话，不写入长期凭证或权威录音。
- `run-task` 建连时发送初始 context/vocabulary；每个 final 句与保守校正结果继续通过 `continue-task` 滚动回灌。稳定上下文保留一条，近期文本保留四条，始终不超过官方五条限制。
- 校正不再在第三个 final block 到达时立即提交：第 4 个 final 或右侧 partial 到达后提交前三块；第 4 个 final 使用非消费式精确音频，partial 则回退到该音轨最近最多 1.5 秒 PCM，追加到二次 ASR 末尾作为只读 lookahead，不进入目标回填或消耗下一批的目标音频。没有右侧内容时，1.2 秒 lookahead 超时会 flush 余下 1–3 块；暂停和保存前也会最多等待 5 秒完成强制 flush，再关闭实时连接或持久化草稿。共享 schema、二次 ASR/LLM 和原子回填均支持 1–3 块。
- Qwen 默认返回的句级与 `words[]` 词片段时间戳、文本和标点已通过主进程、MessagePort、Renderer 草稿契约保留；实现不假定 `words[]` 每项恰好一个汉字。
- 权威录音仍使用显式关闭处理的原始麦克风轨。实时 ASR 使用该轨的 clone，并仅对 clone 请求 AEC、noise suppression 和 auto gain；约束失败时回退原始轨，不能使录音启动失败。
- 增加可选 `MEETING_TRANSCRIPTION_QWEN_LIVE_SPEECH_NOISE_THRESHOLD`，默认不设置；只有经过真实会议音频 0.1 步长 A/B 后才配置。
- 会后 provider 在显式选择 `qwen-audio-3.0-asr-flash-filetrans` 时，仅对 system 远端音轨发送 `diarization_enabled: true`；当前默认模型不自动切换，必须先经过现有转写评测集。
- [短音频 HTTP API](https://help.aliyun.com/zh/model-studio/non-real-time-speech-recognition-for-fun-asr-flash)
- [上下文增强](https://help.aliyun.com/zh/model-studio/improve-asr-accuracy)
- [DeepSeek API](https://help.aliyun.com/zh/model-studio/deepseek-api)
- [结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)
- [临时凭证权限](https://help.aliyun.com/zh/model-studio/generate-temporary-api-key)
- [Glimm](https://glimm.dev/#demos)，局部 canvas API 以安装的 0.3.0 README/类型声明为准。
