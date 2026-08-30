# Qwen 实时字幕背压排查与修复方案

日期：2026-08-11
范围：`apps/desktop` 的 Renderer → `MessagePort` → Electron Main → Node `ws` → DashScope Qwen-ASR-Realtime 音频链路。

## 结论

当前提示“实时字幕处理暂时跟不上，录音仍在继续”不应直接理解成 Qwen 识别失败。现有实现把一次正常、可恢复的流控暂停立即提升成用户可见错误，而且 Main 进程的 drain 边沿检测存在竞态，会漏掉“高水位发生并在下一次轮询前已恢复”的情况。两者叠加后，一次很短的 `ws.bufferedAmount` 峰值就可能让该轨永久停在 `providerWritable = false`，并持续显示错误。

建议分两步修复：

1. **先修正确性**：`sendPcm()` 因高水位拒绝时同步进入 `backpressured` 状态；轮询只要发现 `bufferedAmount <= LOW_WATER_BYTES` 就发一次 `drain`，不依赖轮询曾经观察到高水位。
2. **再修产品语义**：短暂背压只进入内部 `paused/queued` 状态，不立即显示错误；只有队列持续增长到时间/容量阈值并实际丢帧时才提示用户。

## 官方协议与社区实践

### 1. Qwen 的音频块与节奏

Qwen-ASR-Realtime 的 `input_audio_buffer.append` 没有逐块服务端 ACK；VAD 模式会持续接收音频并自行分段。官方 Node.js 和 Python 示例均使用 **PCM16、16 kHz、单声道，每块 3200 bytes（约 100 ms），每 100 ms 发送一次**。因此客户端必须自己做发送端流控，不能等待 Qwen 对每个块确认。[Qwen 客户端事件参考](https://help.aliyun.com/en/model-studio/qwen-asr-realtime-client-events)；[Qwen 实时识别完整示例（Node.js `chunkSize = 3200`、100 ms cadence）](https://help.aliyun.com/en/model-studio/real-time-speech-recognition-user-guide)

本项目 Worklet 每 2400 个 24 kHz 样本生成一帧，即 100 ms；重采样至 16 kHz 后为 1600 个 Int16 样本，即 3200 bytes。这个 cadence 与官方示例一致，不建议先通过进一步减小帧或提高频率解决问题；更碎的 JSON/Base64 WebSocket 消息只会增加帧、UUID、JSON 和调度开销。

### 2. `ws` 的背压语义

`ws.bufferedAmount` 是已由 `send()` 排队但尚未写向网络的数据量；如果立即写出，它可以一直为 0，而且数值包括 WebSocket framing。`ws.send(data, callback)` 的 callback 在数据写出时调用。`ws` 没有浏览器 DataChannel 那样的 `bufferedamountlow` 事件，但提供 `createWebSocketStream()` 以复用 Node stream 的标准背压机制。[`ws` API：`bufferedAmount` 与 `send` callback](https://github.com/websockets/ws/blob/master/doc/ws.md#websocketbufferedamount)；[`createWebSocketStream()`](https://github.com/websockets/ws/blob/master/doc/ws.md#createwebsocketstreamwebsocket-options)；[`ws` 官方 stream 示例](https://github.com/websockets/ws#use-the-nodejs-streams-api)

这意味着：

- 高水位命中是正常的流控信号，不等同于 provider error。
- 若采用轮询模拟 low-water 事件，应用必须在**首次拒绝发送时**记录“当前处于背压”，再由低水位解除；不能要求轮询器先观察到一次高值。
- 另一种可靠实现是给每次 `send` 传 callback，并以 pending bytes/operations 作为精确写出计数；或改用 `createWebSocketStream()` 的 `write() === false` / `drain`。本项目发送的是 JSON 消息，保留现有 `ws.send` 加显式高低水位最小、最清晰。

社区中的成熟实现也采用同一模式。例如 `simple-peer` 在开始背压时保存待完成的写回调，利用 `bufferedamountlow` 恢复；不支持该事件时，每 150 ms 轮询，并且仅在确实有待恢复写操作且缓冲降到阈值后解除背压。它把背压作为 writable stream 的正常暂停/恢复，而非连接错误。[`simple-peer` 背压实现](https://github.com/feross/simple-peer/blob/master/index.js)

### 3. Electron `MessagePort` 不提供原生背压信号

Electron 的 `MessagePortMain.postMessage()` 返回 `void`，公开 API 没有 `bufferedAmount`、high-water 或 drain。Renderer 端 MessagePort 与 Web API 类似，Main 端使用 EventEmitter；因此跨进程这一段需要应用层 ACK/credit window。[Electron `MessagePortMain` API](https://www.electronjs.org/docs/latest/api/message-port-main)；[Electron MessagePorts 指南](https://www.electronjs.org/docs/latest/tutorial/message-ports)

当前 `pcm-ack` 方向是合理的，但语义应明确为“Main 已从 IPC 队列取走这批 bytes”，不是“Qwen 已消费”。WebSocket 写队列需要独立的 `backpressure/drain` 状态，不能把两个 ACK 合并理解。

## 当前代码的具体问题

### P0：drain 边沿可能永久丢失

`live-transcript-ws.ts` 当前每 250 ms 执行：

```ts
const wasAbove = aboveLowWater;
aboveLowWater = socket.bufferedAmount > LOW_WATER_BYTES;
if (wasAbove && !aboveLowWater) onDrain();
```

但 `sendPcm()` 在 `bufferedAmount + bytes.length > MAX_BUFFERED_BYTES` 时只返回 `false`，没有同步设置 `aboveLowWater = true`。

竞态序列：

1. 发送发生短峰值，`sendPcm()` 返回 `false`，Main 向 Renderer 发 `backpressure`。
2. `ws` 在 250 ms 轮询前已经把数据写出，`bufferedAmount` 回落到 64 KiB 以下。
3. 轮询器从未见过高值，`wasAbove` 始终是 `false`，所以永远不发 `drain`。
4. Renderer 的 `providerWritable` 永久为 `false`；后续帧只能进入 Draft queue，最终丢帧。

现有测试实际上固化了这一缺陷：它先让一次拒绝发生、随后直接降至 0，并断言没有 drain；必须再人为让轮询器看到一次高值才期待 drain。真实网络完全可能在两次轮询之间完成排空。

### P0：一次可恢复暂停被立即显示成错误

`live-transcript-draft.ts` 的 `onFrame()` 只要 `connection.sendPcm(frame)` 返回 `false`，就立刻：

```ts
runtime.status = "interrupted";
publish({ error: publicError("backpressure") });
```

队列还没有满、没有丢帧、连接也没有断开时就显示错误。`onWritable()` 虽会在成功 flush 后清错，但受上述漏 drain 影响可能永远不会执行。即便 drain 正常，UI 也会因为一次亚秒级网络抖动闪烁错误。

### P1：高水位预算使用原始 PCM bytes，而实际入队是 JSON/Base64 bytes

`sendPcm()` 判断 `socket.bufferedAmount + bytes.length`，随后发送的是 `JSON.stringify({ audio: base64(bytes), ... })`。Base64 至少膨胀约 4/3，另有 JSON、UUID 和 framing。因此门限不是严格预算。应先构造 payload，以 `Buffer.byteLength(payload)` 判断，或用 send callback/pending bytes 计数真实 payload。

### P1：可观测性不足

当前日志没有记录首次背压时的 `bufferedAmount`、排空耗时、队列峰值、连续暂停次数和实际 dropped frames，无法区分瞬时抖动、漏 drain 和持续慢网。

## 推荐实现方案

### A. Main/WebSocket：有状态的高低水位（首选，最小改动）

建议状态：`writable | backpressured | closed`。

- 高水位：256 KiB 可先保留。
- 低水位：64 KiB 可先保留，形成滞回，避免阈值附近反复切换。
- `sendPcm`：先序列化 payload，按实际 UTF-8 bytes 做预算；命中高水位时设置 `backpressured = true` 并返回 `false`。
- drain poll：仅在 `backpressured` 时轮询；只要 `bufferedAmount <= LOW_WATER_BYTES`，清除状态并发一次 `onDrain`。
- 成功 `send` 后若实际 `bufferedAmount > LOW_WATER_BYTES`，也可将状态标记为 backpressured，但只有下一次帧无法接受时才需通知 Renderer 暂停。
- `send` callback 记录异步 error；不要把 callback 当 Qwen ACK，它只表示本地 WebSocket 写出完成。
- 可把轮询从固定常驻 interval 改为背压期间的 50–100 ms timer，恢复后停止；语义更直接，恢复延迟也低于当前 250 ms。

必须增加回归测试：**拒绝发生后，在第一次轮询前从高水位降到 0，也必须收到一次 drain**；连续轮询只发一次；关闭后不再 drain。

### B. Renderer/IPC：credit window 保留，但职责分开

- `pcm-ack` 继续在 Main 收到并处理 IPC message 后返回，用于限制 MessagePort 在途 bytes。
- provider `backpressure/drain` 继续作为第二层 gate。
- `MAX_INFLIGHT_BYTES` 可以降低到 32–64 KiB（10–20 个 100 ms Qwen 块）来限制跨进程排队延迟；当前 256 KiB 相当于单轨约 8.2 秒 PCM，过大且掩盖问题。
- MessagePort 传输 PCM 时使用 transferable：`postMessage(message, [bytes.buffer])`。当前传空 transfer list 会 structured-clone 3200-byte块；性能不是本次根因，但 transferable 可减少双轨持续复制。

### C. Draft queue 与 UI：背压是 flow-control，丢帧才是 degradation

建议将状态拆成：

- `live`：直接发送或队列为空。
- `buffering`（内部或轻量状态）：连接仍在，暂时排队；不显示红色错误。
- `degraded`：队列超过持续时间阈值或发生 dropped frame；此时才提示“实时字幕可能遗漏，录音仍在继续”。
- `interrupted`：provider/port 真正断开并进入重连。

具体阈值建议：

- 单轨 Draft queue 保留 512 KiB 是约 16.4 秒 16 kHz PCM，但目前队列里存的是重采样前 24 kHz frame，实际约 10.9 秒；建议以后以“音频毫秒数”配置而不是 bytes，避免采样率语义混乱。
- 短暂背压 `< 2 秒` 且无丢帧：静默恢复，不展示错误。
- 持续背压 `>= 2 秒`：可显示非错误型“字幕延迟中”。
- 首次丢帧或队列持续满：显示 degraded 警告；恢复后保留一次性“本段字幕可能有遗漏”标记，不应假装完整。

队列策略：实时字幕重视时效，满载时应丢**最旧**待发帧而不是拒绝最新帧，否则恢复后会发送十几秒前的音频并产生巨大字幕延迟。权威本地录音不受影响，最终离线转录仍可补齐。

### D. 监控指标

每轨记录并节流输出：

- `wsBufferedBytesAtPause`、`backpressureDurationMs`、`drainCount`
- `ipcInFlightBytes`、`draftQueuedAudioMs`、`queuePeakAudioMs`
- `droppedFrames` / `droppedAudioMs`
- `sendCallbackErrorCount`、WebSocket close code/reason

这样可以用一次真实录制确认问题属于“漏 drain”还是“网络吞吐持续低于 32 KB/s/轨”。PCM 载荷本身仅约 32 KB/s/轨（Base64/JSON 后约 43 KB/s 加少量开销），正常宽带长期触发 256 KiB 高水位并不合理；若修复漏 drain 后仍持续增长，应重点检查代理/VPN、系统休眠或 provider connection，而不是继续放大内存队列。

## 验收标准

1. 单元测试模拟 100 ms 音频连续发送 10 分钟，正常 ACK 下无用户可见错误、无丢帧。
2. 模拟一次 300–800 ms WebSocket 堵塞，队列增长后 drain，UI 不显示错误并完整恢复。
3. 模拟高水位在第一次轮询前恢复，必须发 exactly-once drain。
4. 模拟 5 秒慢网：显示“字幕延迟中”，恢复后回到 live。
5. 模拟队列满：按策略丢最旧帧、增加 dropped audio 指标并显示 degraded 提示，本地录音持续。
6. 关闭/重连时所有 timers、pending callbacks 和 queue 都按 generation/session 隔离，不允许旧连接的 drain 唤醒新连接。

## 实施顺序

1. 修复 Main 的背压状态机与竞态测试（P0）。
2. 修改 Draft UI 语义：不再把第一次 `false` 当错误（P0）。
3. 增加指标并跑真实双轨 30 分钟 soak test（P1）。
4. 再根据实测决定是否降低 IPC window、改 oldest-drop 和采用 transferable（P1/P2）。
