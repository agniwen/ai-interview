# 飞书妙记 / 智能会议纪要实时总结调研

调研日期：2026-09-04

证据基线：仅使用飞书/Lark 官方产品页、帮助中心、开放平台文档和
[Lark 官方 CLI](https://github.com/larksuite/cli) 源码。本文不包含业务代码修改。

## 结论先行

可以做，而且本项目现有的 Deepgram 实时转录已经覆盖了最难的输入层。飞书的产品形态本质上是：

```text
稳定的实时转写 / 说话人 / 时间轴
  -> 周期性增量总结
  -> 会中持续更新的要点视图
  -> 会后基于完整转录重新生成正式纪要
```

飞书官方确认有“会中 AI 实时总结”，但没有公开刷新周期、模型、提示词、上下文合并方式或延迟 SLA。
因此“它如何实现”的底层管线只能做工程推断，不能当作已披露事实。

对本项目，建议第一版只使用 **Deepgram 已定型的 final turns**，每 30–60 秒或累计到一定字符数后，
将“上一版结构化状态 + 新增 turns”交给大模型更新；停止录制后，再沿用现有正式 transcript revision
运行一次完整 Meeting Intelligence，覆盖实时预览。不要为实时总结重新上传或重新转录音频。

## 1. 产品边界：妙记不是实时总结本身

### 官方确认

- **妙记（Minutes）**承担音视频转文字、说话人、时间轴、回放和逐字稿等内容沉淀。
- **智能会议纪要（AI Meeting Notes）**承担会中总结和会后总结、章节、待办、知识复用。
- 官方明确描述智能会议纪要会“结合飞书妙记”提供会议总结、章节总结、待办、回放和逐字稿。

来源：

- [飞书智能会议纪要产品页](https://www.feishu.cn/product/ai-meeting-summary)
- [飞书智能会议纪要能力说明](https://www.feishu.cn/content/article/7577317993749269689)
- [Lark AI Meeting Notes](https://www.larksuite.com/product/ai-meeting-notes)

所以用户口中的“妙记实时总结”，更准确的产品名称是“智能会议纪要的会中实时总结”；妙记是其内容底座之一。

## 2. 用户体验与触发方式

### 官方确认

- 在会议中开启“AI 纪要/智能纪要”后，侧边区域会持续展示 AI 提炼的初步要点；迟到或走神的参会者
  可以直接回顾此前讨论。
- 预约会议时可以预先开启智能纪要，并设置内部或外部查看范围。
- 官方当前还宣称“不录制也能使用智能纪要”，说明会中总结不以“完整录音文件已经落盘”为前提。
- 会后会形成更完整的总结、章节纪要、待办、逐字稿和回放，并可把待办转成飞书任务。

来源：

- [飞书智能会议纪要能力说明](https://www.feishu.cn/content/article/7577317993749269689)
- [AI 总结要点和行动项的官方操作说明](https://www.feishu.cn/content/article/7600354912756681687)
- [Lark AI Meeting Notes](https://www.larksuite.com/product/ai-meeting-notes)

### “实时”的准确含义

官方确认总结会在会议进行中更新，但没有公开：

- 固定刷新间隔；
- 是每句话触发，还是按时间/文本阈值触发；
- 第一次总结前需要积累多少内容；
- P50/P95 延迟；
- 会中结果是否会被后续上下文重写。

因此应把它理解为**近实时的语义快照**，而不是“每个字 token-by-token 流出来”。不同官方材料对会后速度使用
“0 延迟”“秒出”和“60 秒内”等不同营销表述，也不构成稳定 SLA。

## 3. 输入和结果形态

### 官方确认的输入

飞书公开描述过以下输入：

- 实时语音转写和逐字稿；
- 说话人身份/声纹识别结果；
- 会中投屏等多种信息；
- 会议类型或场景；
- 企业信息，用于提高语境理解。

官方称总结会基于“会中沟通内容、投屏等多种信息，结合会议类型”，并称说话人身份会用于会中字幕、
会中总结和会后纪要。[飞书智能会议纪要能力说明](https://www.feishu.cn/content/article/7577317993749269689)

### 官方确认的输出

会中重点是让用户快速跟上进度，主要呈现当前议题、讨论要点和阶段性结论。会后结果更完整，包括：

- 全局会议摘要；
- 按主题切分的章节纪要；
- 明确决策和关键讨论；
- 行动项、负责人；
- 不同发言人的观点总结；
- 完整逐字稿和音视频回放；
- 可点击回到原文/时间点的溯源；
- 可编辑文档及任务联动。

来源：[飞书智能会议纪要能力说明](https://www.feishu.cn/content/article/7577317993749269689)、
[行动项与时间戳说明](https://www.feishu.cn/content/article/7600354912756681687)。

## 4. 可能的技术管线（工程推断）

飞书没有公开内部架构。根据“会中更新”“可不录制”“使用实时说话人身份”和“会后提供完整纪要”这些产品事实，
合理的工程推断是：

```text
实时音频 / 会中事件 / 可选投屏
  -> 流式 ASR + 稳定片段判定
  -> 说话人识别与会议时间轴
  -> 主题边界或时间窗口
  -> 上一版摘要 + 新增稳定转录的增量归并
  -> 结构化要点 / 决策 / 待办
  -> 会中 UI 快照
  -> 会后用完整内容进行最终重算与校正
```

以下细节也属于工程建议，不是飞书已披露实现：

- 只消费稳定的 final turns，避免 interim 文本反复改写总结。
- 不应每句话都调用模型；应使用 30–60 秒 debounce、字符阈值和最小有效信息阈值。
- 每次模型输入应是“上一版状态 + 新增 turns”，而不是持续把整场逐字稿全量重传。
- 摘要条目应持有稳定 ID，并用 `upsert/resolve/remove` 语义更新，减少 UI 跳变和重复。
- 决策、行动项、风险等必须附带 turn ID 或时间范围，供用户点击溯源，也便于防止无依据生成。
- 会中内容只标记为“实时草稿”；会后正式纪要应基于完整正式转录重新生成，允许纠正早期推断。

## 5. 开放 API 能力与边界

### Minutes / 妙记 API：主要是生成后的资源

公开 Minutes v1 能力包含：获取基础信息、搜索、订阅生成事件、获取 AI 产物、下载媒体、获取统计和导出转写。
官方 SDK 中的资源路径包括：

- `GET /minutes/v1/minutes/:minute_token`
- `GET /minutes/v1/minutes/:minute_token/artifacts`
- `GET /minutes/v1/minutes/:minute_token/transcript`
- `GET /minutes/v1/minutes/:minute_token/media`
- `minutes.minute.generated_v1` 生成事件

来源：

- [官方 Go SDK：Minutes resource](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/minutes/v1/resource.go)
- [官方 Go SDK：Minutes model](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/minutes/v1/model.go)
- [官方 Go SDK：Minutes generated event](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/minutes/v1/event.go)
- [导出妙记文字记录](https://open.feishu.cn/document/minutes-v1/minute-transcript/get)

这些接口没有提供“直接调用飞书内部实时总结模型”或“持续读取飞书已经生成的会中总结”的公开原语。

### 新的 VC 会中事件 API：可以拿到实时转写，但不是实时总结服务

截至本次调研，飞书开放平台已经出现新的会中事件链路：

- `GET /open-apis/vc/v1/bots/events`
- 事件中包含 `transcript_received`、会中聊天、参会人、共享内容等类型；
- 通过分页游标增量读取；
- 应用身份读取时，机器人必须实际在会议中；会议结束后只有很短的读取窗口；
- 所需会议读取权限和身份/资源可见范围仍然生效。

来源：

- [Lark 官方 CLI：会中事件参考](https://github.com/larksuite/cli/blob/main/skills/lark-meeting/references/lark-vc-meeting-events.md)
- [Lark 官方 CLI：会中事件实现](https://github.com/larksuite/cli/blob/main/shortcuts/vc/vc_meeting_events.go)
- [Lark 官方 CLI：应用机器人入会](https://github.com/larksuite/cli/blob/main/skills/lark-meeting/references/lark-vc-agent-meeting-join.md)

这意味着：**如果未来要处理飞书会议本身**，可以让应用机器人入会，读取 `transcript_received`，再用自己的模型
生成实时总结；但飞书并没有把其成品“智能会议纪要实时总结”作为 API 直接输出给第三方。

对当前 Desktop 本地录制场景，没有必要绕行飞书 VC API：现有 Deepgram 流式转录更直接，也不要求会议发生在飞书里。

## 6. 隐私、权限与产品限制

### 官方确认

- 会议录制受主持人/会议管理员控制；参会者申请录制时，主持人可以同意或拒绝；开始云录制还需指定文件所有者。
  [飞书会议室录制帮助](https://www.feishu.cn/hc/zh-CN/articles/360049067538//)
- 智能纪要和妙记可以设置查看/编辑/分享范围，预约会议时可限制仅内部成员可见，或允许外部成员查看指定内容。
  [智能纪要操作说明](https://www.feishu.cn/content/article/7600354912756681687)
- OpenAPI scope 不等于资源访问权。应用读取妙记还要配置妙记数据权限范围，调用身份也必须对目标资源实际可见。
  [配置应用数据权限](https://open.feishu.cn/document/home/introduction-to-scope-and-authorization/configure-app-data-permissions)
- 导出逐字稿、读取妙记基础信息、机器人入会和读取会议事件是不同权限，应分别申请、发布并经租户管理员审核。

### 对本项目的要求

- 开始录音/转录/AI 总结前必须明确告知参与者，并记录同意或至少记录告知状态。
- 实时摘要与原始逐字稿应沿用同一个 workspace/meeting 权限边界，不能因“只是摘要”而扩大可见范围。
- 模型调用日志不要写入完整逐字稿；错误日志应只保留会议 ID、turn 范围、token 数和脱敏错误。
- 保存 `provider/model/promptVersion/inputTurnWatermark`，确保结果可审计和可复现。
- 实时草稿应允许自动过期或由会议清理流程一并删除；正式结果继续走现有 retention/purge 规则。
- 外部面试场景还需要明确说明录音、转写、AI 提炼的目的和保存期限。

## 7. 当前项目的可落地方案

当前项目已有：

- Deepgram 实时转录、final turn 判定和说话人/时间轴；
- 可持久化的 `MeetingLiveTranscriptDraft`；
- 录制停止后固化的正式 transcript revision；
- 结构化 Meeting Intelligence（摘要、主题、决策、行动项、开放问题）及 evidence turn IDs；
- Worker、队列、租约、checkpoint 和失败恢复基础。

现有实现参考：

- [实时转录草稿结构](../../packages/shared/src/meeting-transcription.ts)
- [Deepgram 实时转录拼接](../../apps/desktop/src/renderer/src/lib/meeting-capture/deepgram-realtime-transport.ts)
- [Meeting Intelligence 生成器](../../packages/meeting-processing/src/meeting-intelligence-generator.ts)
- [Meeting Intelligence Worker](../../apps/worker/src/meeting-intelligence/processor.ts)

### 推荐首版

```text
Desktop 收到 Deepgram final turn
  -> 上传/追加稳定 turn（带 id、speaker、startMs、endMs）
  -> 服务端维护 per-meeting watermark
  -> 30–60 秒或达到字符阈值后入队一次 live-summary update
  -> 模型输入：previous snapshot + turns after watermark
  -> 校验所有 evidenceTurnIds 属于已输入 turns
  -> 持久化新 snapshot + watermark + revision number
  -> SSE/WebSocket/短轮询推送 Desktop
  -> 停止录制后，以正式 transcript revision 运行现有完整 Meeting Intelligence
```

实时结构建议复用现有 general Meeting Intelligence 的核心字段，另加很少的状态字段：

```ts
{
  revision: number;
  coveredThroughMs: number;
  updatedAt: string;
  summary: string;
  topics: Array<{ id: string; summary: string; evidenceTurnIds: string[] }>;
  decisions: Array<{ id: string; text: string; evidenceTurnIds: string[] }>;
  actionItems: Array<{
    id: string;
    text: string;
    owner: string | null;
    dueAt: string | null;
    evidenceTurnIds: string[];
  }>;
  openQuestions: Array<{ id: string; text: string; evidenceTurnIds: string[] }>;
}
```

### 为什么不直接复用现有会后 Worker

现有生成器面向不可变正式 revision，并可能对整场内容分块/归并；它适合会后高质量结果，不适合每隔几十秒反复全量运行。
实时链路应是独立的短任务：只处理新增稳定 turns，覆盖旧的实时 snapshot，但不创建正式 Meeting Intelligence revision。
最终停止录制后仍由现有会后流程发布正式结果。

### 首版刻意不做

- 不接屏幕视觉、投屏或 OCR；
- 不基于 interim 字幕总结；
- 不逐句话调用模型；
- 不让实时总结自动创建任务或改变招聘决策；
- 不把实时草稿冒充正式会议纪要；
- 不依赖飞书 VC，除非未来产品明确要求应用机器人参加飞书会议。

## 8. 风险和验证指标

建议先灰度验证以下指标：

- 首次可用总结延迟；
- 两次更新间隔的 P50/P95；
- 每小时模型调用次数和 token 成本；
- 相同要点重复率、条目频繁跳变率；
- 无 evidence 的条目比例（目标为 0）；
- 会中草稿与会后正式结果的差异率；
- 停顿、网络重连、重复 turn、录制恢复后的幂等性；
- 用户点击证据时间戳后能否准确定位原始发言。

首版的合理体验目标不是“像字幕一样逐字实时”，而是**每 30–60 秒给出稳定、可追溯、不会剧烈跳变的会议进度快照**。
