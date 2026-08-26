# Desktop 实时字幕升级与三个 block 联合校正

## 当前行为

- 实时模型为 `qwen-audio-3.0-asr-flash-streaming`。页面按可见且完成的 block 计数，麦克风和系统音轨合计三个一组；同一个 block 内有多句话也只计一次。部分字幕、重复完成事件不重复触发，不足三个不自动提交。
- 每组只发一个 IPC 命令。主进程在 capture 会话层找到三个原连接的 PCM，按 block 顺序拼成一份 16 kHz、单声道、16-bit WAV。只调用一次 `qwen-audio-3.0-asr-flash` 整体识别，再调用一次 `deepseek-v4-flash-0731`，不再逐块或分音轨请求 ASR。
- LLM 输入包含整段重新识别结果、三个 block 的原文/音轨/拼接后时间边界、已有校正前文，以及 ASR 期间新到的实时后文。前后文分别最多五个 block，每个最多 2000 字符。使用 JSON 输出模式，要求保守纠错、不编造、不总结，输出恰好三个原 ID 与对应文本。
- 对返回 ID、数量、文本逐项校验；Renderer 比较所有原稿后一次性回填三个 block。任何一个原稿被更新、旧 section 被关闭或模型返回不完整，都不部分覆盖。成功后保存 `originalText` 与组合模型名 `correctionModel`，临时 `correcting` 不持久化。
- 提交批次时立即在三个 block 内的正文前显示渐变 AI 星星，排队、ASR 和 LLM 期间保持。使用本地内联 SVG，不依赖远程图标加载，也不再通过负向 left 定位。固定前导位置避免状态变化时文字横跳。
- 回填时隐藏星星，随后每块播放一次 Glimm prism 扫光；模型确认无需改字时也播放。文本 block 与 canvas 都为直角。失败、取消、历史重挂载或重复事件不重播。减少动态效果和 WebGL 不可用时安全降级。

## 生命周期与资源

- 校正是独立侧路，不阻塞录制或保存，不读取/修改录音 spool，不代理 PCM 到业务 Backend。永久 API Key 不进入 Desktop，两个 HTTP 阶段均使用现有后端签发的临时凭证。
- 每轨保留最近 90 秒 PCM（2.88 MB）和最多 30 个完成 block 的时间元数据；单块最多 60 秒。任一片段缺失则整组保留原文，不用不完整音频纠正三个 block。
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

## 生效

本次改动涉及主进程、preload 和 renderer：先保存/结束当前录制，再完整重启 Desktop，开发环境重新执行 `make desktop-dev`。仅刷新页面无法更新旧的 IPC 协议。

此前的实时模型升级需 Backend 支持新模型授权和草稿两个可选字段；显式设置了 `MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL` 的环境仍以该变量为准。旧 `qwen3-asr-flash-realtime` 协议保留，但不启用本次校正侧路。

## 官方依据

- [实时客户端协议](https://help.aliyun.com/zh/model-studio/fun-asr-client-events)
- [实时服务端协议](https://help.aliyun.com/zh/model-studio/fun-asr-server-events)
- [短音频 HTTP API](https://help.aliyun.com/zh/model-studio/non-real-time-speech-recognition-for-fun-asr-flash)
- [上下文增强](https://help.aliyun.com/zh/model-studio/improve-asr-accuracy)
- [DeepSeek API](https://help.aliyun.com/zh/model-studio/deepseek-api)
- [结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)
- [临时凭证权限](https://help.aliyun.com/zh/model-studio/generate-temporary-api-key)
- [Glimm](https://glimm.dev/#demos)，局部 canvas API 以安装的 0.3.0 README/类型声明为准。
