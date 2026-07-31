# LiveKit 面试中“思考停顿被抢话”的处理建议

调研日期：2026-07-31。结论基于 LiveKit 最新官方文档、1.6.7 发布说明及官方仓库社区讨论。

## 结论

这个问题属于 **user turn endpointing（判断候选人何时说完）**，不是 LiveKit 所说的 interruption（候选人打断正在讲话的 Agent）。因此当前 `false_interruption_timeout=2.0` 和 `resume_false_interruption=True` 不能防止 Agent 在候选人思考时抢话；它们只负责 Agent 已经在讲话、被无有效转写的声音暂停后恢复。

当前项目已经使用正确方向的组合：

- `inference.TurnDetector`：直接读取音频，结合语义、语调、节奏判断是否说完，官方专门以“用户说要想一下并长停顿”为典型场景；中文受支持。
- dynamic endpointing：`min_delay=0.8`、`max_delay=5.0`。
- 本地 `.env` 为 `INTERVIEW_SELF_HOSTED=1`，因此显式使用较轻量的 `v1-mini`。
- ElevenLabs `scribe_v2` 是 batch STT；非流式 STT 会由 SDK 的 VAD 包装，但当前 turn detector 优先决定轮次边界。仅切换到 realtime STT 不会自动解决抢话。[Turn detector](https://docs.livekit.io/agents/logic/turns/turn-detector/)；[Turns overview](https://docs.livekit.io/agents/logic/turns/)

但有一个重要版本问题：锁文件当前是 LiveKit Agents **1.6.4**。1.6.7 修复了 dynamic endpointing 会错误学习并缩短 `max_delay` 的问题；修复后 `max_delay` 才保持为固定上限，只动态学习 `min_delay`。因此现在配置的 5 秒在会话后段可能实际被学短。[1.6.7 release](https://github.com/livekit/agents/releases/tag/livekit-agents%401.6.7)；[修复 PR #6265](https://github.com/livekit/agents/pull/6265)

## 建议顺序

1. **先升级到 LiveKit Agents 1.6.7 或更高 1.6.x**，再判断参数效果。这是最可能影响当前现象的确定性修复。
2. **优先测试完整 `v1`，不要本地固定 `v1-mini`**。官方说明本地 dev 使用 LiveKit Cloud 凭据时，未指定版本会选择完整 `v1`；完整模型准确率最高。官方 eot-bench 的英文数据中，在 600ms 延迟预算下，v1 的误截断率为 4.5%，v1-mini 为 12.1%。该数字不能直接代表中文，但证明两版本差距明显；基准数据集本身包含中文。[eot-bench](https://github.com/livekit/eot-bench)
3. **面试优先“不抢话”时，提高等待下限和上限**。建议首轮 A/B：dynamic `min_delay=1.5`、`max_delay=7.0`。模型认为“已说完”时主要走 `min_delay`，认为“还会继续”时走 `max_delay`；所以只提高 max 不足以修复误判为已完成的情况。dynamic 会根据候选人的停顿逐步学习；官方也明确建议“Agent cuts users off mid-thought”时提高 `min_delay`。[Turn-taking tuning](https://docs.livekit.io/agents/logic/turns/tuning/)；[Options reference](https://docs.livekit.io/reference/agents/turn-handling-options/)
4. 如果完整 v1 和延时调整后仍误判，可小范围 A/B `unlikely_threshold` 的中文覆盖值。官方说明阈值越高越耐心，但 SDK 会警告自定义阈值可能破坏校准，因此不应先做，也不能凭感觉直接上线。
5. 作为恢复机制，检测“Agent 刚开始说话就被候选人立即打断”的状态序列，对候选人接下来的续答临时提高 `min_delay/max_delay`。LiveKit 现已支持运行时 `session.update_options(...)`；官方维护者也在相同社区案例中建议这一做法，但这是社区实践，不是框架的自动保证。[社区 Issue #3019](https://github.com/livekit/agents/issues/3019)

## 无法绕过的边界

任何自动 endpointing 都无法保证候选人可以**无限时长思考且永不被抢话**：在纯静音中，系统没有可观察信号区分“还在思考”和“已经说完”，有限 `max_delay` 最终一定会提交。

如果产品要求绝对保证，只能提供显式结束信号，例如“回答完毕”按钮、按住说话/松开提交，并使用 LiveKit 的 `turn_detection="manual"`、`commit_user_turn()`；这是官方支持的确定性方案。折中方案是自动模式保留，并提供“我还没说完/继续思考”恢复入口。

切换到 Realtime 也不是必然解决：OpenAI Realtime 的 semantic VAD 可设 `eagerness="low"`，官方称更适合让用户慢慢说；但这意味着更换模型链路。LiveKit 的完整音频 turn detector 已针对同一问题设计，应该先在现有 ElevenLabs STT + 阿里云 LLM + MiniMax TTS 管线内完成上述升级和 A/B。[OpenAI Realtime turn detection](https://docs.livekit.io/agents/models/realtime/plugins/openai/#turn-detection)

## 验证方式

用真实中文面试录音构造 0.8、1.5、2.5、4、6 秒的句中思考停顿，同时覆盖“语法看似完整但仍要继续”的句子。分别记录误截断率、最终句尾响应延迟 P50/P95，以及 Agent 开口后候选人立即反抢的次数。当前项目已有 EOU 延迟指标，但还缺“句中停顿是否被错误提交”的业务标注，不能只凭平均延迟判断效果。
