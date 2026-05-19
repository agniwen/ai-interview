# Round Invite Email (Resend) — Design Spec

**Status**: implemented
**Date**: 2026-05-19
**Owner**: allen

## Goal

在面试详情页的每个面试轮次旁加一个「发送邮件」按钮，点击后通过 Resend
向候选人邮箱发送该轮次的面试邀请邮件。允许重发，UI 显示发送次数与最后一次发送时间。

## Non-goals

- 多模板管理（拒信、提醒等）—— 本期只做"轮次邀请"一个模板
- 异步队列 / Resend webhook 回写交付状态 —— MVP 同步发，失败立即报错
- 多租户的发件人配置 —— 全局 `RESEND_FROM`
- 群发 / 批量发送 / 顶部入口
- 发送历史详情抽屉

## Architecture

新子路由：`apps/ai-recruitment-copilot/src/server/routes/studio/routes/interviews/routes/round-emails/`

```
round-emails/
├── route.ts          # Hono 子路由，挂在 /studio/interviews/round-emails
├── schema.ts         # zod: SendRoundEmailParams, RoundEmailSummary
├── dao.ts            # insertEmailLog, summarizeEmailLogsForRounds
└── utils/
    └── templates.tsx # React Email 组件 RoundInviteEmail + renderRoundInviteEmail()
```

理由：遵循 CLAUDE.md 的 nested-children 约定；邮件相关的 Resend client、模板、日志
DAO 都和 round 本身解耦，未来扩展（webhook、批量、其他模板）不会污染 interviews
路由。

新 server 模块：`apps/ai-recruitment-copilot/src/lib/server/resend.ts`，
`import "server-only"` 守卫，导出单例 `resend` client（lazy-init，第一次访问时校验
`RESEND_API_KEY` / `RESEND_FROM`）。

## Data model

新表 `studio_round_email_log`，schema/relations 放在 `@arc/db-schema` 包里
（`packages/db-schema/src/schema.ts` + `relations.ts`），与项目现有 Drizzle 约定一致。

| 列                  | 类型                                                                | 说明                        |
| ------------------- | ------------------------------------------------------------------- | --------------------------- |
| `id`                | `text` PK                                                           | nanoid                      |
| `organizationId`    | `text` NOT NULL, FK → `organization`, cascade delete, indexed       | 多租户隔离                  |
| `interviewRecordId` | `text` NOT NULL, FK → `studio_interview`, cascade                   | 反向查询                    |
| `roundId`           | `text` NOT NULL, FK → `studio_interview_schedule`, cascade, indexed | 关联轮次                    |
| `toEmail`           | `text` NOT NULL                                                     | 发送时刻邮箱快照            |
| `subject`           | `text` NOT NULL                                                     | 渲染后标题快照              |
| `templateKey`       | `text` NOT NULL default `'round_invite'`                            | 为后续多模板预留            |
| `resendMessageId`   | `text`                                                              | Resend 返回 id；失败为 null |
| `status`            | `text` NOT NULL, $type<`'sent' \| 'failed'`>                        | 发送状态                    |
| `errorMessage`      | `text`                                                              | 失败时 Resend 错误简述      |
| `sentBy`            | `text`, FK → `user`, set null                                       | 发起人（审计）              |
| `createdAt`         | `timestamp` default now NOT NULL                                    | 即"发送时间"                |

索引：

- `(organization_id)`
- `(round_id, created_at desc)` —— 摘要聚合用

迁移流程按项目约定：`pnpm db:generate` 生成 SQL → review → `pnpm db:migrate`。

## Resend integration

依赖：`resend` (官方 SDK) + `@react-email/components`。

环境变量（写入 `.env.example`）：

```
RESEND_API_KEY=
RESEND_FROM=noreply@yourdomain.com
```

启动时不强校验（保持本地无 key 也能跑），首次调用 `resend.emails.send()` 时若缺失抛
`ApiError(500, "RESEND_API_KEY 未配置")`。

模板：React Email 组件 `RoundInviteEmail`，props =
`{ candidateName: string; roundLabel: string; scheduledAt: Date | null; interviewUrl: string }`。

- 内容：问候 + 轮次名 + 时间（如有）+ 主 CTA「进入面试」按钮（指向 `interviewUrl`）+ 兜底纯文本链接
- `renderRoundInviteEmail(props)` 返回 `Promise<{ subject; html; text }>`：
  - `subject`：`${roundLabel} 面试邀请`
  - `html`：`await render(<RoundInviteEmail {...props} />)`（`@react-email/render`）
  - `text`：`await render(<RoundInviteEmail {...props} />, { plainText: true })`
- route 处理器直接 `import { resend } from "@/lib/server/resend"`，不在子路由 utils 再包一层。

面试 URL：`${process.env.NEXT_PUBLIC_BASE_URL}/interview/${interviewRecordId}/${roundId}`。
若 `NEXT_PUBLIC_BASE_URL` 缺失，抛 500（部署配置错误）。

## API

挂载前缀：`/api/w/:slug/studio/interviews/round-emails`，复用 interviews 路由树上现有的
workspace + auth 中间件。

| Method | Path                      | 入参              | 出参                                                                                                       |
| ------ | ------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| POST   | `/:roundId/send`          | 空 body           | `200 { logId: string; sentAt: string; toEmail: string }`                                                   |
| GET    | `/summary?roundIds=a,b,c` | query string list | `200 { [roundId]: { count: number; lastSentAt: string \| null; lastStatus: 'sent' \| 'failed' \| null } }` |

**`POST /:roundId/send` 流程**：

1. 校验 `roundId` 存在且属于当前 organization（DAO `loadInterviewRoundDetail`
   已经做这事，复用）；不存在 → 404
2. 取关联 `studioInterview.candidateEmail`；为空 → 400 `ApiError("候选人邮箱未填写")`
3. 渲染模板 → 调 `resend.emails.send({ from, to, subject, html, text })`
4. 成功：写一条 `status='sent'` 日志，返回 200
5. Resend 抛错或返回错误：写一条 `status='failed'` 日志，返回
   400 `ApiError("邮件发送失败：<resend message>")`

**`GET /summary`**：单条 SQL（`GROUP BY round_id` 聚合 count + max(created_at) +
last status via window function 或子查询），结果 map 化返回。

**不在 MVP 范围**：详情列表接口（`/:roundId/logs`）。等审计需求出现再加。

## Frontend UI

入口：面试详情页（`app/(auth)/w/[slug]/studio/interviews/_components/interview-detail/...`）
内每个 round 行右侧新增一个 ghost button。

按钮状态机：

| 条件                             | 文案                               | 状态                                                 |
| -------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| `!interview.candidateEmail`      | 「发送邮件」                       | disabled + tooltip「请先在面试信息中填写候选人邮箱」 |
| 未发送过 (`summary.count === 0`) | 「发送邮件」                       | 可点                                                 |
| 已发送过                         | 「重发」+ 小字「已发 N 次 · X 前」 | 可点                                                 |
| 发送中                           | spinner                            | loading                                              |

点击行为：

- 首次发送：confirm dialog「将发送邮件到 `xxx@xx.com`，确认？」
- 重发：confirm dialog「已发送过 N 次，最近一次 X 时间，确认重发？」
- 提交后调用 `rpc.api.w[":slug"].studio.interviews["round-emails"][":roundId"].send.$post`
- 成功：toast「邮件已发送」+ invalidate round summary query
- 失败：toast 显示后端错误信息

数据加载：

- 进入详情页时 prefetch `GET /summary?roundIds=...` 把当前所有 round 的摘要一次拉回
- 用 React Query，cache key `["studio", "round-emails", "summary", roundIds]`

不做：富文本预览、模板可编辑、抄送/密送、附件。

## Error handling

- `RESEND_API_KEY` / `RESEND_FROM` 未配置 → 500 + 明确错误信息（开发者可见）
- `NEXT_PUBLIC_BASE_URL` 未配置 → 500
- 候选人邮箱为空 → 400（前端 button 本来就 disable，是双重保险）
- Resend 4xx/5xx → 400，落 `status='failed'` 日志，UI toast
- 跨 organization 越权访问 round → 404（不泄露存在性）

## Testing

- `dao/__tests__/round-email-log.test.ts`：insert、summary 聚合（count/last）、
  org 隔离、cascade delete 行为
- `routes/__tests__/route.test.ts`：mock `@/lib/server/resend`，覆盖
  - happy path（200 + 日志写入）
  - 邮箱为空（400）
  - Resend 抛错（400 + 失败日志）
  - 跨 org 越权（404）
- `utils/__tests__/templates.test.tsx`：snapshot 验证 subject/html/text 渲染

E2E 不动。

## Migration plan

1. 装依赖：`resend`、`@react-email/components`
2. `.env.example` 加两行
3. 新表 schema → `db:generate` → `db:migrate`
4. 写 server 模块（resend client、模板、DAO、route）
5. 挂载子路由到 `interviews/route.ts`
6. 前端按钮 + dialog + summary query
7. 测试

## Open questions / future work

- 后续要不要加 Resend webhook（`/api/webhooks/resend`）回写 `delivered` /
  `bounced` / `opened` 状态？需要时加表列 `deliveredAt` / `bouncedAt` 即可
- 是否需要 rate limit（同一 round 24h 最多 N 次）？目前依赖人工 confirm dialog
- 多 organization 自定义发件人 → org 表加 `senderEmail` / `senderName` 列
