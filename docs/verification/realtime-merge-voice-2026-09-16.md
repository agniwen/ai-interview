# Realtime 合并后合成语音 E2E（2026-09-16）

## 测试边界

- 基线：`834e029b4`，`dev` 合并 `feat/realtime-agent` 后；使用用户已启动的本地 Web 与 Agent。
- 仅使用用户授权的产品测试工作区、姜旭记录 `9cf9c545-62f7-4719-89fc-74f37026ebf8`、轮次 `bf2bbb83-2d03-4d1c-ae15-cb503f51990e`。以下回答均为虚构测试素材，不能用于实际招聘判断。
- 准备表单按页面必填要求完成，自由文本明确标为测试数据。沟通始终 `allowTextInput=false`，未用聊天文本代替语音。
- 第一轮使用 Python RTC 客户端发布 macOS Tingting 合成的 24 kHz PCM 麦克风音轨，接收真实 Agent 音频，但未在浏览器播放。
- 用户要求可听见后，改为可见的 Codex 内置浏览器。临时本地组件用文件选择器载入 WAV，经 Web Audio 的 `MediaStreamAudioDestinationNode` 发布为 LiveKit 麦克风轨，同时本地播放合成候选人语音；AI 回复由原有网页音频组件播放。观察到音频元素 `paused=false`、`muted=false`、`readyState=4`。
- 临时组件只替换音频输入源，不修改 Agent、工具、问题、回调或评分；仍不能代替实体麦克风采集、声学回声、噪声、移动端、弱网丢包测试。
- 音轨方法依据 [LiveKit raw tracks](https://docs.livekit.io/transport/media/raw-tracks/) 和 [LocalAudioTrack](https://docs.livekit.io/reference/client-sdk-js/classes/LocalAudioTrack.html)。

## 已确认的问题

### P1：部分回答提前结束后，最终报告被后端拒绝

房间后缀 `7412`。口头告别并断开后，数据库仍为 `in_progress / pending`、最终转写为空。Agent 持久化 outbox 中实际有 `completed` 报告与 9 条转写。

对这个指定测试报告执行一次原样回调重试，得到 HTTP 400：

```json
{
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "dataCollectionResults": [
        "insufficient must not have a reason",
        "insufficient must not have a reason"
      ]
    }
  },
  "error": "Invalid payload"
}
```

`apps/livekit-agent/src/realtime_interview_agent.py` 的 `finalize_missing_question_outcomes` 将有事实的草稿转为 `insufficient`，但仍附带 `candidate_ended_round` 原因；`packages/shared/src/interview/question-outcomes.ts` 只允许 `interrupted / unasked` 带原因。跨语言契约不一致，常规重试不能恢复。

### P2：缺失核心信息仍被标为已回答

`7412` 中只说了“过去三年没有晋升，也没有嘉奖”，未回答加薪、绩效评级、奖金，绩效题却被存为 `answered`。其配置是 `all_required`；现有 40 项局部回归通过并不能保证这一语义行为正确。

### P2：已聊过的项目被归为未问，事实未归档

`7412` 中 AI 明确问过亮点项目；候选人说“音频推荐、负责内容策略、规模结果记不清”，并诱导编造 50% 增长。AI 拒绝编造并追问团队规模，候选人随后要求退出。最终项目题却为 `unasked`、无摘要。应至少保留已有项目事实并正确反映已提问。

### 报告范围仍需修正

网页完整轮次 `5343` 的报告已 ready，8 项均有答案。但沟通评语仍写“未提供关于求职状态、到岗时间等补充信息，导致部分基础信息无法收集”，这两项未出现在本轮 8 项沟通清单中，且用户明确表示没有补充。与上一轮修复记录中的验收目标不一致。

## 轮次证据

| 后缀 | 路径            | 场景                                                                                    | 结果                                                                             |
| ---- | --------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 7412 | Python RTC 语音 | 部分回答、跨题补充、人数更正、拒答、无 AI 经历、诱导编造、提前退出                      | 能纠正 6→4、拒绝编造、保留无 AI 经历；存在上述归档及 400 问题                    |
| 5343 | 可见网页语音    | 工作与项目跨题回答，遗漏薪酬后补充，薪资/人数跨题更正，没有补充但暂不结束，语音确认结束 | 网页显示结束；13 条对话、8 项 answered、报告 ready；更正同步到工作/项目/期望薪资 |

完整轮次 AI 工具并未漏答：语音和网页转写均包含“熟练用豆包和通义写内容初稿，每份人工复核，效率提高约 30%”。对应工具条目也保存了这三类事实。

## 自动检查与证据文件

- `uv run pytest tests/test_realtime_interview_agent.py tests/test_realtime_tool_boundaries.py tests/test_agent_session_config.py -q`：40 passed。
- 本地原始素材及报告快照：`/tmp/ai-interview-merge-voice/`；不提交包含测试履历的原始音频与完整快照。
- 下方追加记录包含后续失败、修复和最终对照结果。

## 追加回归（9 月 17 日）

- `3491 / 3150`：多次只回答一份工作、没有晋升嘉奖、仅绩效评级、仅 AI 工具名；观察到继续追问缺项，明确拒答/记不清后停止。`3150` 部分绩效事实最终保存为 insufficient，未因 callback 契约错误丢失。
- `9646 / 7844`：复现单项工具 `covered_topics` 的 nullable union 被模型生成成 JSON 字符串，触发参数解析错误和重复开场。增加实际 provider schema 回归，改用普通 array schema。
- `3389`：无人作答等待时触发 Qwen `response_idle_timeout`，不是有效问答通过轮次。
- `2514`：同一动机语音正常进入下一问；跨题补充薪酬/绩效/离职/期望后仍主动询问项目背景和 AI 使用情况。只说“豆包”继续追问；明确用途、熟练度和未统计效率后继续收尾。已保存八项回答，人数及薪资更正归档正确。但离开两分多钟后，上游先空闲超时，重入失败，因此整轮不能记为通过。
- `3756`：再次验证工作/绩效缺项追问和拒答；后半段遇到 `ClientConnectionResetError`，不能记为完整通过。
- `1115`：恢复测试期间房间消失，报告尚未返回。该轮并发执行过全量检查，原因未确认，不作为有效恢复证据。
- 核实本地 `uv run src/agent.py dev` 在 LiveKit Agents 1.7.1 已移除进程内热更新；01:01 明确重启本地 Agent。之前轮次只保留观察证据，最终验收必须以重启后的轮次为准。

### 上游生命周期适配

Qwen-Audio 官方 session.update 未提供可配置的连接空闲超时字段，不能直接套用 Qwen-Omni 的 idle_timeout_ms。当前适配在无未完成操作时，对 response_idle_timeout / user_idle_timeout 和连接断开重建会话，恢复指令、工具定义和已确认历史，不再次请求开场、不重执行工具。恢复最多连续尝试三次；未确认音频和未完成工具不盲目重放。

离线协议测试覆盖连续两次连接更新、历史顺序保持、不重复生成/工具调用、存在未完成工具时不伪装成功。还需真实重入验证。

### 检查结果更新

- 根 typecheck：16 个任务通过。
- Python 全量：224 passed, 13 skipped（随后又扩展连接恢复用例）。
- 根 TypeScript test：Web 1064 passed / 1 failed；失败在未修改的 human-interview-stage-meetings.test.tsx，UTC 环境下期望 17:30、实际 09:30。其他已运行包通过。该时区基线问题单列，不计为本次修复通过。

### 浏览器重入截止时间修复

`9316` 在实际离开不足 3 分钟时已显示结束。核对发现：之前短暂断开留下的 `disconnectedAt` 没有在成功重连后清除，后续离开沿用了旧截止时间。新增实际连接确认接口，核实原房间候选人与 Agent 均存在后清除旧时间；浏览器每次 Connected 时有界重试确认。单独获取 token 不修改宽限状态，已完成轮次不可恢复。

`5196` 核对重连后 `disconnectedAt=null`；再次离开记录新的时间 18:03:14 UTC。返回时已超过 3 分钟，页面正确显示结束，报告已 ready。这轮仅验证超时结束，不作为 3 分钟内返回成功的证据。

真实 Qwen 中途断线补测中，三次早期试验均完成恢复提示和后续音频问答。最后重复试验又有一次第三轮等待 response.done 超过测试端 60 秒，被测试超时中止；不能将其记为通过。随后增加仅事件类型的诊断日志并复测，两个完整三轮试验成功。该间歇性长延迟仍需保留在验收限制中，不等同于已定位并修复。

### 最终浏览器对照轮次 7913

- 18:10:56 UTC 离开，18:13:21 回到原房间，间隔约 145 秒。原候选人 identity、Agent PID、房间均未更换，Agent 取消宽限定时器并回放 5/5 条历史；数据库恢复 in_progress，disconnectedAt 清空。
- 重入后继续真实 WAV 音频：拒答上一份工作后仍可对话；只说“豆包”继续追问熟练度和效率；补充用途、熟练度和“未统计效率”后转而追问绩效缺项，没有反复要求编造百分比。
- 手动结束后立即显示结束，刷新仍然结束。最终报告 ready：AI 使用题 answered/revision 2，绩效题 insufficient，已明确拒答的工作信息 skipped，未聊题目 unasked。已有部分事实保留，无最终回调 400。

### 33 分钟上游语音测试

独立真实 Qwen 音频协议测试持续 1981 秒，11 轮 WAV 输入、11 次连接建立（10 次恢复），两轮之间静默 190 秒以跨越上游空闲期限。第 9～11 轮仍能引用前面“写内容初稿”的事实；没有重新开场。它不是 33 分钟网页完整业务面试，也没有验证实体麦克风、弱网丢包或跨 Agent 进程恢复。

### 回复流停滞补测

新增自动响应 watchdog 回归：无待确认工具/配置操作的自动回复超时走连接恢复，关闭旧输出流并要求补说；不会重放候选人音频。开场、未确认工具与恢复提示本身故障仍按原来的保守终止处理。

真实模型试验通过本地协议故障注入丢弃首轮 response 输出/完成事件，并将测试实例 watchdog 缩短到 30 秒；生产默认仍为 120 秒。三次初测均恢复了连接，其中一次后续恢复回复出现候选人口吻的虚构经历，因此不能作为语义通过。仅强化历史中的 system 消息后，三次仍未按要求播报。最终改用 session.update 临时替换指令并关闭工具，播报完成后恢复原始指令与工具。最终三次独立真实音频试验全部通过：首轮超时重连、固定恢复通知、之后两轮音频继续正常提问；未出现候选人口吻或虚构经历。离线回归同步验证工具关闭及恢复。此类故障注入只用于适配器测试，不修改真实业务数据。

### 检查和清理

- 根 TypeScript check：3410 文件通过；根 typecheck：16/16 任务通过。
- 根 TypeScript test：Web 1065 通过，1 项未修改的时区基线失败；其它已运行包通过。相关连接接口/状态测试 9 项、浏览器连接 hook 1 项均通过。
- Python 全量：231 passed，13 skipped；ruff check 通过，本次 7 个 Python 文件格式通过。全局 ruff format 仍仅报告未修改的 src/dispatch_context.py，不擅自格式化无关文件。
- 已移除网页合成音频入口和两个本地审计/报告探针；原始音频、私有快照、故障注入脚本均留在 /tmp，不提交。只保留正式实现、回归测试和本记录。
- 内置浏览器初次摄像头启动曾报 Could not start video source，通过原会话重入完成语音验证；不能据此声称实体摄像头路径已通过。
