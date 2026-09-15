# Qwen Realtime 适配器

`src/qwen_realtime.py` 实现 LiveKit Agents 1.7 的 `llm.RealtimeModel` / `llm.RealtimeSession` 接口，直接连接百炼 WebSocket。它不依赖 OpenAI 插件的私有实现，也不包含逐题状态机或面试决策规则。

## 接入

在 agent 自己的 `.env` 中设置 `DASHSCOPE_API_KEY`。可选配置见同目录 `.env.example` 的 `DASHSCOPE_REALTIME_*`，默认模型为 `qwen-audio-3.0-realtime-plus`，默认使用北京地域的旧版兼容域名。业务空间域名可以通过 `DASHSCOPE_REALTIME_BASE_URL` 配置；凭据必须与所用地域一致。

```python
from livekit.agents import Agent, AgentSession, function_tool
from qwen_realtime import RealtimeModel


@function_tool
async def get_interview_progress() -> dict:
    """读取面试进度。"""
    # 实际接入时，从应用状态返回题目、已收集答案和待了解的信息。
    return {"total": 2, "completed": 1, "remaining": ["q2"]}


model = RealtimeModel.from_env()
session = AgentSession(llm=model)
agent = Agent(
    instructions="你是中文面试官。围绕信息清单自然交流，通过工具读取和保存状态。",
    tools=[get_interview_progress],
)
# 在既有 job 生命周期内：
# await session.start(agent=agent, room=ctx.room)
# 退出时关闭 session 和 model。
```

适配器支持 LiveKit 执行工具、将 `function_call_output` 写回 Qwen、等待确认，再显式发起工具后的回复。工具定义采用 Qwen 的嵌套 `function` 格式，同一响应中的重复工具事件按 `call_id` 去重。应用工具仍需自行验证题目 ID、管理状态和持久化结果。

`src/agent.py` 默认使用 Realtime；`make agent-dev` 会启动新流程。显式设置 `INTERVIEW_VOICE_MODE=pipeline` 可回退到原 STT/LLM/TTS 流程。

默认音色为 `longanlingxin`（龙安灵心），关闭 `enable_speech_emotion`，采用较克制的表达。音色仍可通过 `DASHSCOPE_REALTIME_VOICE` 覆盖，新会话生效。

## 面试状态与工具

`RealtimeInterviewAgent` 根据题目、考察意图与追问方向自由组织交流，不使用原逐题任务或强制追问次数。

- `get_interview_state`：完整清单、总数、已处理数、充分回答数、当前话题及剩余时间。
- `set_active_topics`：标记一个或多个正在聊的话题，不限制题目顺序。
- `record_answer`：使用简单字段保存一项回答，跨题时连续调用；支持收集中、已回答、信息不足、跳过，校验题目 ID，重复保存不增加版本，更正增加版本。避免将复杂答案数组交给模型生成，降低参数格式错误。
- `finish_interview`：正常完成时可保存最后一项回答，再根据实际剩余信息判断完成度；提前退出或超时时两个 final 字段必须为空，已有事实先通过 record_answer 保存，工具拒绝把退出请求直接标为答案。接受候选人提前结束，交接给收尾 Agent，再通过 LiveKit `EndCallTool` 关闭房间。

草稿通过 `in_progress` checkpoint 保存；不足/跳过的具体原因保存在回答摘要中。最终报告将未完成条目转换为中断/未提问，不自动补造答案。前后端与 agent 应一起更新，以支持新增草稿状态。

候选人短暂离线时保留同一个 agent 的内存状态，并通过既有 checkpoint/报告路径持久化答案；刷新页面恢复转写、计时和麦克风状态。Realtime 重连后等待候选人继续，避免再次生成上一条回答。房间 `departureTimeout` 设置为重连宽限期加 60 秒，确保 LiveKit 默认 20 秒房间回收不会提前结束会话。进程退出或 Qwen WebSocket 断开会终止当前会话，不承诺跨进程恢复声学上下文。

## 能力与边界

| 项目     | 行为                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------ |
| 音频     | 输入单声道 PCM16，自动重采样至 16 kHz，20 ms 分包；输出 24 kHz PCM16                                   |
| 轮次     | 默认 `smart_turn`；支持 `server_vad`；`session(turn_detection_disabled=True)` 使用手动提交             |
| 转写     | 用户中间/最终转写、助手字幕；环境音不进入用户回答；无效语义轮次不触发新答复                            |
| 工具     | LiveKit function tools；可动态更新工具；`auto` 与通过移除工具实现的 `none`                             |
| 上下文   | 文本、函数调用、函数结果的追加/删除/原位置替换；逐项等待服务端确认                                     |
| 临时指令 | `generate_reply(instructions=...)` 注入系统消息，响应结束后删除                                        |
| 主动开场 | Qwen 要求至少一条用户消息；适配器使用临时启动信号，隐藏于 LiveKit 历史和候选人转写之外，响应结束即删除 |
| 打断     | 取消当前或刚请求的响应，关闭流，处理服务端 VAD 与客户端取消的竞态                                      |
| 计量     | 响应耗时、首 token 耗时、文本/音频 token 数映射到 LiveKit metrics                                      |
| 连接故障 | 有界发送缓冲和请求超时；报告不可恢复错误并释放流，不自动重放音频或工具                                 |

以下能力不伪装成已支持：

- `tool_choice="required"` 或指定函数：Qwen 当前协议未提供相应保证，明确拒绝。
- 精确音频历史截断：未声明 `message_truncation`。打断后服务端仍可能保留比用户实际听到更多的已生成内容。
- 原生逐字 `say()`：未声明 `supports_say`。确需固定播报的独立场景应配置 TTS 或提供音频。
- 历史前插/重排序：Qwen 未文档化 OpenAI 的 `root` 插入标记，在任何远端修改前拒绝；需要构建新会话上下文。普通末尾追加、删除和追加工具结果不受影响。
- 视频、Qwen Omni 协议和断线后无损声学上下文恢复不在本适配器范围内。
- 百炼还可能主动终止长时间无输入的连接：本地静音文字测试中，最后一次用户输入约 3 分钟后收到了 `user_idle_timeout`。此时会保存已有结果并结束会话；应用的 3 分钟重连宽限不代表上游连接一定存活 3 分钟。

持续运行时，由应用保存题目与答案状态。模型历史窗口不应成为唯一状态来源。Qwen 只允许在第一段音频之前配置轮次模式，并只在第一次 `session.update` 设置音色，因此这些选项按会话固定。

## 验证

在 `apps/livekit-agent/` 下运行：

```bash
# 离线协议回归，不调用模型
uv run pytest tests/test_qwen_realtime.py -q

# 真实模型与 LiveKit 集成，需要显式开启，使用合成数据，会消耗百炼额度
RUN_QWEN_REALTIME_TESTS=1 uv run pytest tests/test_qwen_realtime_live.py -q
```

真实测试覆盖：主动开场不伪造候选人消息、LiveKit 工具执行与进度回传、实际面试 Agent 的跨题保存和答案更正、音频输入/输出、`smart_turn` 自动触发、取消后继续生成。测试不创建房间，不修改简历或面试记录，也不发业务回调；不能替代浏览器麦克风、WebRTC 播放与真实候选人网络条件下的验证。

## 核对依据

- [Qwen WebSocket API](https://help.aliyun.com/zh/model-studio/fun-audiochat-realtime-websocket-api)
- [Qwen 客户端事件](https://help.aliyun.com/zh/model-studio/fun-audiochat-client-events)
- [Qwen 服务端事件](https://help.aliyun.com/zh/model-studio/qwen-audio-realtime-server-events)
- [LiveKit Realtime 接口](https://github.com/livekit/agents/blob/main/livekit-agents/livekit/agents/llm/realtime.py)
- [LiveKit 测试文档](https://docs.livekit.io/agents/start/testing/)
- [Issue #3774：打断与挂起的响应](https://github.com/livekit/agents/issues/3774)
- [Issue #5359：工具前置语音播放等待](https://github.com/livekit/agents/issues/5359)

Issues 用于选择回归场景，不代表这些问题已在当前安装的 SDK 中复现。接口已与本项目实际安装的 `livekit-agents==1.7.1` 核对；真实模型测试使用本地 `.env` 中的凭据。
