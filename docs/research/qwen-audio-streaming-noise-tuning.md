# Qwen-Audio-3.0-ASR-Flash-Streaming 抗噪调参结论

调研日期：2026-07-31

## 结论

`speech_noise_threshold` 可以减少“噪声被当作语音并转成文字”，但它只是
服务端 VAD 的语音/噪声判定阈值，**不是真正的音频降噪、回声消除或语音增强**。
若背景噪声已经覆盖或污染人声，仅调这个参数无法恢复干净语音，仍应在音频送入
ASR 前做噪声抑制/声源隔离。

本项目当前还有一个直接影响测试结果的因素：
`INTERVIEW_DISABLE_NOISE_CANCELLATION=1` 会令
`AudioInputOptions.noise_cancellation=None`，完全关闭 Agent 侧的 LiveKit
增强降噪。因此，用此前建议的这条本地命令测试：

```bash
INTERVIEW_DISABLE_NOISE_CANCELLATION=1 uv run src/agent.py dev
```

测到的是“原始输入（至多保留前端标准 WebRTC 处理）→ 阿里云 ASR”的效果，
不是项目默认的 “ai-coustics Voice Focus → 阿里云 ASR” 效果。

## 阿里云可调参数

### `speech_noise_threshold`

- 适用于 `qwen-audio-3.0-asr-flash-streaming`。
- 范围：`[-1.0, 1.0]`。
- 越接近 `-1`：噪声越容易被识别为语音，可能产生更多噪声转写。
- 越接近 `+1`：更严格地过滤疑似噪声，但轻声、远场语音也更容易被过滤。
- 官方建议每次以 `0.1` 小步调整并用真实音频验证。
- 官方参数表**没有公布默认值**；不能假设默认是 `0`，也不能断言“不传就是关闭”。

来源：[阿里云客户端事件与请求参数](https://help.aliyun.com/zh/model-studio/fun-asr-client-events)、
[阿里云 Python SDK 参数表](https://help.aliyun.com/zh/model-studio/fun-asr-realtime-python-sdk)。

这项参数的正确用途是降低风声、敲击、电视声等触发 VAD 后产生无意义转写的概率。
它不会修改音频波形，也不会从人声中分离背景声，所以不能等同于 NS、AEC 或
ai-coustics/Krisp。

### 其他相关参数

| 参数                           | 官方默认/范围            | 作用                                                            | 是否降噪 |
| ------------------------------ | ------------------------ | --------------------------------------------------------------- | -------- |
| `semantic_punctuation_enabled` | `false`                  | `false` 使用低延迟 VAD 断句；`true` 使用语义断句并关闭 VAD 断句 | 否       |
| `max_sentence_silence`         | `1300 ms`；`[200, 6000]` | 尾部静音达到多久后结束句子，仅 VAD 断句时生效                   | 否       |
| `multi_threshold_mode_enabled` | `false`                  | 防止 VAD 切出的句子过长，仅 VAD 断句时生效                      | 否       |

同一官方请求参数表没有提供服务端 NS、AEC、AGC 开关。阿里云面向嘈杂环境的
官方建议也把 RNNoise、AEC 等放在应用侧前处理：
[语音识别常见问题](https://help.aliyun.com/zh/isi/support/faq-about-speech-recognition)。

## LiveKit 前置降噪

LiveKit 明确区分两类预处理：

- Voice isolation：保留主说话人，抑制其他人声和噪声；适合单候选人面试。
- Background noise suppression：抑制交通、风扇、音乐等非语音噪声，同时保留
  所有人声。

官方可用选项包括：

- `ai_coustics.EnhancerModel.QUAIL_VF_S` / `QUAIL_VF_L`：面向 Agent
  pipeline、STT 和 turn detection 的 Voice Focus。
- `noise_cancellation.BVC()`：Krisp 单说话人语音隔离。
- `noise_cancellation.BVCTelephony()`：SIP/电话优化版本。
- `noise_cancellation.NC()` 或 ai-coustics `QUAIL_L`：非语音背景噪声抑制。

ai-coustics 的 `enhancement_level` 范围为 `0.0` 到 `1.0`，越大处理越激进；
官方示例使用 `0.8`，未设置时采用模型内置默认值。来源：
[LiveKit Noise & echo cancellation](https://docs.livekit.io/transport/media/noise-cancellation/)。

LiveKit 还说明音频预处理发生在 STT、VAD 和 turn detector 之前，因此它不仅
影响识别准确率，也会影响误打断。LiveKit Cloud 的增强模型可用于经过 Cloud
传输的音频，而不要求 Agent 进程本身部署在 Cloud；自托管 SFU 使用
ai-coustics 时则需要单独的 ai-coustics license key。来源：
[LiveKit Turn-taking tuning](https://docs.livekit.io/agents/logic/turns/tuning/)、
[LiveKit Noise & echo cancellation](https://docs.livekit.io/transport/media/noise-cancellation/)。

## 本项目现状与测试建议

当前代码：

- 没有向阿里云请求传入 `speech_noise_threshold`，因此使用服务端未公开的默认行为。
- WebRTC 候选人默认使用 `QUAIL_VF_L`，`enhancement_level=0.7`。
- SIP 候选人默认使用 `BVCTelephony()`。
- 设置 `INTERVIEW_DISABLE_NOISE_CANCELLATION=1` 或
  `INTERVIEW_SELF_HOSTED=1` 时，Agent 侧前置降噪均为 `None`。

建议把两个问题分开测试：

1. **噪声触发出文字/误打断**：保持同一段音频，先不传阈值作为基线，再按
   `+0.1` 方向逐档 A/B；出现轻声或远场漏识别时回退一档。因为官方未公布
   默认值，不应把某个具体数值描述为“默认值”。
2. **噪声覆盖人声、转写本身错误**：优先确保
   `INTERVIEW_DISABLE_NOISE_CANCELLATION` 未开启，并测试现有
   `QUAIL_VF_L`；此类问题不能靠 `speech_noise_threshold` 根治。
3. 分别记录安静、风扇/键盘、背景音乐、附近人声四组结果；“非语音噪声”和
   “竞争人声”应分别选择 background suppression 与 voice isolation。
4. 不要在前端和 Agent 端同时叠加高级降噪模型。LiveKit 官方警告高级模型通常
   以原始音频训练，双重处理可能产生异常；标准 WebRTC noise cancellation 和
   echo cancellation 可以保留。
