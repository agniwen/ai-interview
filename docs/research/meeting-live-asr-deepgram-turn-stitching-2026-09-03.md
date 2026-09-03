# 会议实时字幕 Deepgram 换行与文本重复修复结论

调研/修复日期：2026-09-03

## 结论

Desktop 选 Deepgram 做会议实时字幕时，一句话“很快就换行”、以及合并成一行后
“同一句话/同一段词重复出现”，**根因都在转写层对 Deepgram 流式窗口的拼接方式**，
不是后端的 AI 校正模型。

- 换行过频：代码把“一行结束”绑定在 Deepgram 的 `is_final` 上，而 `is_final` 在同一句
  连续话语中会多次触发（每次让窗口 `start` 前移），于是同一个人一句完整的话被切成多条。
- 合并后再重复：把同一个 utterance 内的多个 `is_final` 窗口按原文拼接时，没有按词时间戳
  去重。Deepgram 相邻窗口的尾部词会重叠/被重复发出，甚至把同一段词的归属改判到另一个
  说话人，拼接就出现“前半句 + 前半句尾巴再拼一遍”或同一段话在两个人名下各出现一次。

有效修复（见“实现”一节）为两件事同时做：**把换行/定型信号从 `is_final` 换成 `speech_final`，
并按“已发出的最大词尾时间”对窗口词做时间轴去重**。

## Deepgram 官方语义（本次修复的依据）

- `endpointing`（默认 **10ms**）：静音达到该时长才判定一句话结束，返回
  `speech_final: true`。推荐的对话取值是 **300–500ms**；设 `endpointing=false` 可
  完全关闭停顿检测（改用 Deepgram 自身的 chunk 节奏）。
- `is_final` 与 `speech_final` 是**两个不同信号**：
  - `is_final: true` 只表示“这段已达到最高准确率、文本不再变化”，同一句连续说话过程中会
    **多次出现**，每次还会让窗口的 `start` 前移、开启新窗口。
  - `speech_final: true` 才是“检测到停顿、这一句说完了”。
- 结论：一句话是否结束应以 `speech_final` 为准；`is_final=true` 但尚未停顿的窗口，应合并进
  当前这一行（同一 turn），而不是新起一行。官方也明确提示“不要把 `speech_final` 单独拿来
  复原整句”——长句在 `speech_final` 前会有多个 `is_final` 段，需要把这些段拼接起来。

来源：

- [Configure Endpointing and Interim Results](https://developers.deepgram.com/docs/understand-endpointing-interim-results)
- [Endpointing reference](https://developers.deepgram.com/docs/endpointing)
- [Interim Results reference](https://developers.deepgram.com/docs/interim-results)

## 实现

改动集中在 Desktop 渲染进程的 Deepgram 传输层
`apps/desktop/src/renderer/src/lib/meeting-capture/deepgram-realtime-transport.ts`。

1. **`createDeepgramLiveUrl`**：新增 `endpointing=300`，避免默认 10ms 在几乎每个短停顿就
   判定一句结束。
2. **`createDeepgramResultEventMapper`**（原来是无状态的 `deepgramResultToTranscriptEvents`，
   改为按连接持有闭包状态的映射器，连接处每个 WebSocket 只 new 一个实例）：
   - 维护 `utteranceKey`（只在 `speech_final` 后自增）、`lastEmittedEndMs`（已发出的最大词尾
     时间，用于去重）、以及按说话人存的 `{ buffer, window }`。
   - 词按 `speaker` 分组；进入的词若 `Math.round(word.end * 1000) <= lastEmittedEndMs` 则丢弃
     （重叠/重复/改判重发），否则计入。
   - `is_final=true`：把（去重后）窗口文本追加进 `buffer`，清空 `window`，并推进
     `lastEmittedEndMs`；`is_final=false`（interim）：用（去重后）窗口文本**替换** `window`。
   - 对外发出的 `text = buffer + window`（即整句到当前为止的完整文本），`type` 只在
     `speech_final` 时为 `completed`，否则为 `snapshot`。
   - `speech_final=true`：`utteranceKey += 1` 并清空各说话人 buffer。
   - 依赖的字词字段（`start/end/speaker/punctuated_word`）来自 Deepgram 流式 `Results`，
     `words` 走 `wordToLiveWord` 统一转换。单声道（`channels=1`）时间轴单调，按时间戳去重安全。

## 验证

- 传输层单测 `deepgram-realtime-transport.test.ts`（5 个）：URL 含 `endpointing=300`；
  同一消息内按说话人拆开；同一 utterance 的多次 `is_final` 窗口合并为一行、仅 `speech_final`
  定型、文本随窗口累计；重叠尾部词被丢弃；改判到另一说话人后重复词不再产出。
- Desktop `apps/desktop` 的 `meeting-capture` 全量 48 个测试通过。
- `packages/meeting-live-transcript` 包 6 个测试通过。
- Desktop 包 `tsc --noEmit` 通过；`ultracite check` 0 警告 0 错误。

## 关联发现：liveCorrection 是 Qwen/DashScope 专属

`liveCorrection`（实时 AI 校正）不是 Deepgram 能力，也没有“设置里打开”的开关：

- 它把一句定型后的原文连同其**原始音频片段**重新发一次更强的
  `qwen-audio-3.0-asr-flash`（DashScope `/api/v1/services/aigc/multimodal-generation/generation`），
  再用 LLM `deepseek-v4-flash-0731`（`/compatible-mode/v1/chat/completions`）与实时原文调和，
  回填校正文本。
- 模型、端点、`baseUrl`/`token` 全部写死为 DashScope；音频片段靠
  `DashScopeRealtimeWsConnection.takeCorrectionAudio(block.itemId, ...)` 从 Qwen 那条 WebSocket
  连接按 block 取出缓冲音频（见 `packages/meeting-live-transcript/src/live-transcript-correction-session.ts`）。
- Deepgram 的 `MEETING_LIVE_TRANSCRIPT_PROVIDER_CAPABILITIES.deepgram.liveCorrection === false`，
  且 `connectDeepgramRealtimeTranscription` 只返回 `{ close, sendPcm }`，无 `correct` 方法、也不
  按 block 缓冲音频，因此即使能力位被置 true 也会被 `createLiveTranscriptCorrectionBatches`
  因 `connection.correct` 缺失而跳过。
- 结论：为 Deepgram 开 liveCorrection 需要新建一套 Deepgram 校正流程（音频缓冲 + `correct`
  回调 + 校正后端），不是配置项；Deepgram Nova-3 已开 `smart_format`+`punctuate`+`diarize`，
  除非实际观察到明确同音字/断句/数字错误，否则这两层额外模型调用带来的延迟与成本不划算。

## 未验证与后续

- 本环境无法跑真实 Deepgram WebSocket + 实时音频，传输层逻辑以单元测试验证。
- 若重新构建录制后仍见重复，需采集原始帧（`is_final`/`speech_final`/`start` + 每个词的
  `start/end/speaker`）判别：是“在新的时间戳上真的又说了一遍”（属于正常重复，不应去重），
  还是 Deepgram 在重叠窗口上重发/改判（已由此去重覆盖）。
