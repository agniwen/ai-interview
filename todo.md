# TODO：优化"候选人思考停顿时 agent 抢答"

## 背景

面试场景下，候选人说到一半陷入思考（句子不完整），LiveKit 的 turn detector 把这种"中间停顿"误判成"说完了"，agent 跟着抢答，体验差。

## 根因（已查证 LiveKit 源码）

`livekit/agents/voice/audio_recognition.py:934-958` 的核心逻辑：

```python
endpointing_delay = endpointing.min_delay   # 当前 = 0.5s
eou_prob = await turn_detector.predict_end_of_turn(chat_ctx)
unlikely_threshold = await turn_detector.unlikely_threshold(language)

if eou_prob < unlikely_threshold:
    endpointing_delay = endpointing.max_delay   # 当前 = 8.0s
# else: 用 min_delay 0.5s 立即回 ← 抢答来源
```

也就是说：模型对当前句子打一个"已说完概率"，**低于阈值才切到 `max_delay=8s` 长等待**；否则只等 `min_delay=0.5s` 就回。
抢答 = 模型把"我想想啊……"这种思考停顿误判成"说完了"（概率高于阈值）。

## 已有配置（已查 `apps/livekit-agent/src/agent.py`）

- `MultilingualModel()` — 默认参数，使用语言内置阈值
- `endpointing`: `dynamic`, `min_delay=0.5`, `max_delay=8.0`
- `interruption`: `adaptive`, `min_duration=0.8`, `min_words=1`, `false_interruption_timeout=2.0`, `resume_false_interruption=True`
- Silero VAD: `activation_threshold=0.7`, `min_speech=0.25`, `min_silence=1.5`, `prefix_padding=0.3`（过保守，已偏离官方默认 0.5/0.05/0.55/0.5）
- `preemptive_generation=False`（7ac027b 关闭）
- 噪声抑制：`ai_coustics.QUAIL_VF_L`（非 SIP）+ `BVCTelephony`（SIP）— 顶配
- `interview_agent.py:144` 已经定义 `on_user_turn_completed`，目前只注入剩余时间提示

## 待做（三层防御，按优先级）

### [ ] 1. 提高 `MultilingualModel(unlikely_threshold=...)` — 模型层放宽

`apps/livekit-agent/src/agent.py:279`：

```python
"turn_detection": MultilingualModel(unlikely_threshold=0.35),
```

含义：模型给的 EOU 概率必须 ≥ 0.35 才算"可能说完"用 `min_delay`；否则归到"可能没说完"用 `max_delay=8s`。
阈值越高越宽容。先试 0.30，不够再 0.40、0.50。
副作用最小（dynamic endpointing 会自适应）。

### [ ] 2. 提高 `endpointing.min_delay` — 端点层兜底

`apps/livekit-agent/src/agent.py:280-284`：

```python
"endpointing": {
    "mode": "dynamic",
    "min_delay": 1.0,    # 0.5 → 1.0
    "max_delay": 8.0,
},
```

含义：模型判完后再等 1s 才回。代价：短回答节奏整体变慢 0.5s。

### [ ] 3. Silero VAD 回归官方默认 — 让"嗯…啊…"被捕捉为说话中

`apps/livekit-agent/src/agent.py:51-56`：

```python
proc.userdata["vad"] = silero.VAD.load(
    activation_threshold=0.5,           # 0.7 → 0.5
    min_speech_duration=0.05,           # 0.25 → 0.05
    min_silence_duration=1.5,           # 保持
    prefix_padding_duration=0.5,        # 0.3 → 0.5
)
```

含义：让 VAD 对轻声敏感，思考时的填充音重新进入"说话中"状态，turn 不被关。
前提（已满足）：前置 ai_coustics QUAIL_VF_L 在过滤噪音，VAD 不需要再保守。

### [ ] 4. `on_user_turn_completed` 加规则兜底 — 应用层最后一道拦截

`apps/livekit-agent/src/interview_agent.py:144`，在现有时间提示前加：

```python
from livekit.agents import StopResponse

_INCOMPLETE_SUFFIXES = (
    "嗯", "啊", "呃", "那个", "这个", "就是", "然后", "所以", "因为",
    "但是", "不过", "或者", "比如", "比如说", "另外", "其实", "可能",
    "我觉得", "我想", "我感觉", "首先", "其次", "第一", "第二",
    "的话", "的时候", "之后", "之前", "的", "了", "吧",
)
_COMPLETE_PUNCT = ("。", "！", "？", ".", "!", "?")

def _looks_incomplete_zh(text: str) -> bool:
    s = text.strip()
    if not s:
        return True
    if s.endswith(_COMPLETE_PUNCT):
        return False
    for suffix in _INCOMPLETE_SUFFIXES:
        if s.endswith(suffix):
            return True
    if len(s) < 5:
        return True
    return False


async def on_user_turn_completed(self, turn_ctx, new_message):
    text = new_message.text_content or ""
    if _looks_incomplete_zh(text):
        raise StopResponse()
    # …保留现有的时间提示注入逻辑…
```

注意：ElevenLabs scribe_v2 中文输出通常**不带句末标点**，主要靠 `_INCOMPLETE_SUFFIXES` 拦。
副作用：候选人用"对"/"嗯"作为完整短回答时会被误判为不完整、等 false-interruption-timeout（2s）才回，面试场景影响不大。

如果规则误判率偏高，可升级为路径 B（用 qwen-turbo 二次判定）—— 但会在每轮叠加 200–400ms 延迟，先穷尽规则再说。

### [ ] 5. 验证与观测

- `make agent-console` 跑一轮，故意制造三种场景：
  - 说半句停 3s 再继续 → 期望 agent 不抢答
  - 真说完短句 → 期望 agent 1–1.5s 内回
  - 长回答中改口 → 期望 agent 等改口完成
- 看 `EOUMetrics.end_of_utterance_delay` p50 / p95 分布
- 看 `on_user_turn_completed_delay` 是否拖慢节奏
- 监控 `agent_false_interruption` / `user_interruption_detected` 事件比例

## 不要做的

- 不要再加 Silero `min_silence_duration` — 已经 1.5s，再加是粗暴拖延
- 不要换 STT/turn detector — 当前组合（ElevenLabs zh + MultilingualModel + Silero + ai_coustics）已是官方推荐顶配
- 不要开 `preemptive_generation=True` — 7ac027b 关掉是对的，开了会抢答时机更早

## 参考文档

- [Turn-taking tuning](https://docs.livekit.io/agents/logic/turns/tuning/)
- [Turns overview](https://docs.livekit.io/agents/logic/turns/)
- [Pipeline nodes and hooks — on_user_turn_completed](https://docs.livekit.io/agents/logic/nodes/)
- [Silero VAD plugin](https://docs.livekit.io/agents/logic/turns/vad/)
- [MultilingualModel API reference](https://docs.livekit.io/reference/python/livekit/plugins/turn_detector/multilingual)
