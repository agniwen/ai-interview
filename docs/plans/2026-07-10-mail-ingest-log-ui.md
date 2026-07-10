# 邮件入库日志 UI（Plan B）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在工作区账号管理页为每个**已配置**邮箱账号加"邮件入库日志抽屉"入口——账号行显示邮件数徽章（问题数高亮），点开右侧抽屉看上轮轮询小结与逐封邮件的全链路状态/失败原因（含附件明细）。

**Architecture:** 后端扩展 managed 账号列表投影（每行加 `messageCount`/`problemCount`/`lastRun*`），新增 org 作用域的 `GET /managed/:id/messages`（复用 `listAccountMailMessages`，补**后端已截断/单行化的** `errorMessage`），既有 owner-gated `/:id/messages` 逻辑不动。前端在自包含的 studio 路由页加徽章列 + 独立的日志抽屉组件（shadcn `Sheet`）；抽屉按选中账号 `key` remount，数据走 TanStack Query。

**Tech Stack:** Hono + Drizzle ORM + PostgreSQL（后端）；TanStack Start + React 19 + TanStack Query + shadcn/ui（前端）；Vitest（前后端测试，后端 DAO 测试跑真实 PG）。

## Global Constraints

- **Conventional commits**：`feat:` / `test:` / `refactor:` 前缀。
- **Ultracite**：改完 TS 跑 `pnpm fix` 再提交；对象字面量键**按字母序**排列（本仓库现有 DAO/组件均如此，新增字段务必保持字母序，否则 oxfmt 会重排）。
- **后端测试命令**：`pnpm --filter @arc/ai-recruitment-copilot-backend test <文件名子串>`（DAO 测试需可连的 Postgres，`DATABASE_URL` 已在本地 env）。
- **前端测试命令**：`pnpm --filter @arc/ai-recruitment-copilot test <文件名子串>`。
- **类型检查（project-wide）**：后端 `pnpm --filter @arc/ai-recruitment-copilot-backend typecheck`；前端 `pnpm --filter @arc/ai-recruitment-copilot typecheck`。**注意 typecheck 是整包的**——引用未定义符号会失败，故"页面引用抽屉组件/回调"的接线只在组件已存在后进行（见任务顺序）。
- **日期跨线**：DAO 把 `Date` 列 `.toISOString()` 成 `string` 再返回（现有 `MailMessageLogRecord.receivedAt` 已如此）。
- **不改既有 `/:id/messages` 行为**：其 `read` + owner-gated 校验与回归测试保持原样；但它与 managed 路由**共享 `listAccountMailMessages`**，故 Task 2 给该 DAO 加的 `errorMessage`（已截断）会同时出现在两端响应——这是加法变更，两端一致。
- **`errorMessage` 后端脱敏**：截断到 `MAIL_MESSAGE_ERROR_DISPLAY_MAX = 300` 字 + 单行化（去换行），在 DAO 投影层完成，API 不返回无界原始错误。**不做**深度正则清洗（连接串/令牌），残留风险如实声明——该字段是 worker 已 `truncateError` 过的 IMAP/解析错误。
- **权限级别**：新 managed 路由用 `requirePermission("mailIngestAccount", "manage")`，与 `/managed` 列表对齐。
- **`account === null` 成员行**：`/managed` 是成员主表左连账号，会返回无账号的成员行——这类行**不渲染可点徽章**（显示 `—`），徽章/抽屉只对 `account !== null` 的行出现，点击一律用 `account.id`（绝不用 `user.id`）。

---

## File Structure

**后端**（均在 `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/`）：

- `dao.ts`（Modify）— 列表行投影 + 类型 + mapper（Task 1）、messages 补截断 `errorMessage`（Task 2）、新增存在性 DAO（Task 3）。
- `route.ts`（Modify）— 新增 `GET /managed/:id/messages`（Task 4）。
- `__tests__/dao.test.ts`（Modify）— Task 1/2/3 的 DAO 用例。
- `__tests__/route.test.ts`（Modify）— Task 4 mocked 路由用例。
- `__tests__/route.permission.test.ts`（Create）— Task 4 真实中间件权限用例。

**前端**（`apps/ai-recruitment-copilot/src/`）：

- `components/features/studio/mail-ingest/mail-ingest-log-drawer.tsx`（Create）— 日志抽屉组件（Task 5 外壳+小结、Task 6 消息表）。
- `components/features/studio/mail-ingest/mail-ingest-log-drawer.test.tsx`（Create）— 抽屉组件测试（Task 5、6）。
- `routes/w.$slug.studio.mail-ingest-accounts.tsx`（Modify）— 扩展内联行类型 + 徽章列 + 挂载抽屉（Task 7，**在抽屉组件已存在后一次接线**）。

**任务顺序（关键）**：后端 1→4，前端**先建抽屉组件（5、6）再接线页面（7）**——避免页面引用未定义符号导致 typecheck 失败。

---

## Task 1: 账号列表行投影 + 计数 + lastRun\*（workspace & platform）

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/dao.ts`（`WorkspaceMailIngestAccountRow` 约 100-109、`listWorkspaceMailIngestAccountRows` select 约 383-406、`listPlatformMailIngestAccountRows` select 约 445-471、`toWorkspaceMailIngestAccountRow` 约 543-556）
- Test: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/__tests__/dao.test.ts`

**Interfaces:**

- Produces: `WorkspaceMailIngestAccountRow` 顶层新增 `messageCount: number; problemCount: number; lastRunReceived: number | null; lastRunSubjectSkipped: number | null; lastRunMatched: number | null; lastRunQueued: number | null; lastRunFailed: number | null;`。经 `queryPaginatedWorkspaceMailIngestAccounts` 的 `records[]` 带到 `/managed` 响应顶层（与 `account`/`user` 平级）。前端 Task 7 消费。

- [ ] **Step 1: 写失败测试**（追加到 dao.test.ts 的 observability describe 块内，紧随现有 `finishMailIngestAccountRun` 用例；沿用其 `insertTestAccount()` 与 `OBS_ORG`/`OBS_USER` 常量）

```ts
it("projects messageCount/problemCount/lastRun* on workspace rows", async () => {
  const accountId = await insertTestAccount();
  await finishMailIngestAccountRun(accountId, {
    counts: { failed: 1, matched: 3, queued: 2, received: 5, subjectSkipped: 2 },
  });
  await db.insert(mailIngestMessage).values([
    { accountId, id: "m_ok_1", mailbox: "INBOX", status: "queued", uid: "1", uidValidity: "1" },
    { accountId, id: "m_ok_2", mailbox: "INBOX", status: "queued", uid: "2", uidValidity: "1" },
    { accountId, id: "m_fail", mailbox: "INBOX", status: "failed", uid: "3", uidValidity: "1" },
    { accountId, id: "m_skip", mailbox: "INBOX", status: "skipped", uid: "4", uidValidity: "1" },
  ]);

  const { records } = await queryPaginatedWorkspaceMailIngestAccounts(OBS_ORG);
  const row = records.find((r) => r.account?.id === accountId);

  expect(row?.messageCount).toBe(4);
  expect(row?.problemCount).toBe(2);
  expect(row?.lastRunReceived).toBe(5);
  expect(row?.lastRunFailed).toBe(1);
  expect(row?.lastRunMatched).toBe(3);
}, 30_000);
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test dao.test.ts`
Expected: FAIL —`row.messageCount` 为 `undefined`。

- [ ] **Step 3: 扩展行类型**（dao.ts `WorkspaceMailIngestAccountRow`，字母序插入新键）

```ts
export interface WorkspaceMailIngestAccountRow {
  account: MailIngestAccountDto | null;
  lastRunFailed: number | null;
  lastRunMatched: number | null;
  lastRunQueued: number | null;
  lastRunReceived: number | null;
  lastRunSubjectSkipped: number | null;
  messageCount: number;
  problemCount: number;
  user: {
    email: string;
    id: string;
    image: string | null;
    name: string;
    role: string;
  };
}
```

- [ ] **Step 4: workspace 行投影加子查询 + lastRun\* 列**（`listWorkspaceMailIngestAccountRows` 的 `.select({...})`，字母序插入）

```ts
      lastRunFailed: mailIngestAccount.lastRunFailed,
      lastRunMatched: mailIngestAccount.lastRunMatched,
      lastRunQueued: mailIngestAccount.lastRunQueued,
      lastRunReceived: mailIngestAccount.lastRunReceived,
      lastRunSubjectSkipped: mailIngestAccount.lastRunSubjectSkipped,
      messageCount: sql<number>`(select count(*)::int from mail_ingest_message where account_id = ${mailIngestAccount.id})`,
      problemCount: sql<number>`(select count(*)::int from mail_ingest_message where account_id = ${mailIngestAccount.id} and status in ('failed','skipped'))`,
```

（`::int` 把 `count(*)` 的 bigint 转成 int，node-postgres 才给 JS `number`；`sql<number>` 提供 TS 类型。账号为 null 时 `account_id = null` 子查询得 `0`。）

- [ ] **Step 5: platform 行投影加相同 7 键**（`listPlatformMailIngestAccountRows` 的 `.select({...})`——平台 mapper 复用 workspace mapper，不补列 TS 会在 `toWorkspaceMailIngestAccountRow(row)` 处断裂）

```ts
      lastRunFailed: mailIngestAccount.lastRunFailed,
      lastRunMatched: mailIngestAccount.lastRunMatched,
      lastRunQueued: mailIngestAccount.lastRunQueued,
      lastRunReceived: mailIngestAccount.lastRunReceived,
      lastRunSubjectSkipped: mailIngestAccount.lastRunSubjectSkipped,
      messageCount: sql<number>`(select count(*)::int from mail_ingest_message where account_id = ${mailIngestAccount.id})`,
      problemCount: sql<number>`(select count(*)::int from mail_ingest_message where account_id = ${mailIngestAccount.id} and status in ('failed','skipped'))`,
```

- [ ] **Step 6: mapper 带出新字段**（`toWorkspaceMailIngestAccountRow` 返回对象，字母序插入）

```ts
return {
  account: toNullableAccountDto(row),
  lastRunFailed: row.lastRunFailed,
  lastRunMatched: row.lastRunMatched,
  lastRunQueued: row.lastRunQueued,
  lastRunReceived: row.lastRunReceived,
  lastRunSubjectSkipped: row.lastRunSubjectSkipped,
  messageCount: row.messageCount,
  problemCount: row.problemCount,
  user: {
    email: row.userEmail,
    id: row.userId,
    image: row.userImage,
    name: row.userName,
    role: row.memberRole,
  },
};
```

- [ ] **Step 7: 加"无账号成员计数为 0"测试**（spec 明确的左连接边界；追加用例——建一个无账号的 member，断言其行 `account === null` 且 `messageCount === 0`）

```ts
it("returns account===null member rows with messageCount 0", async () => {
  // insertTestAccount 建了 OBS_ORG + OBS_USER(owner)。再加一个无账号成员：
  await db.insert(user).values({
    createdAt: NOW,
    email: "obs-noacct@mail-ingest.test",
    emailVerified: true,
    id: "obs_noacct_user",
    name: "No Account",
    updatedAt: NOW,
  });
  await db.insert(member).values({
    createdAt: NOW,
    id: "m_obs_noacct",
    organizationId: OBS_ORG,
    role: "member",
    userId: "obs_noacct_user",
  });

  const { records } = await queryPaginatedWorkspaceMailIngestAccounts(OBS_ORG);
  const noAcct = records.find((r) => r.user.id === "obs_noacct_user");

  expect(noAcct?.account).toBeNull();
  expect(noAcct?.messageCount).toBe(0);
}, 30_000);
```

（`NOW`/`user`/`member` 已在文件顶部导入/定义；若 observability 块用别的常量名，改用该块实际的常量。cleanup 已按 org 删 member/account，user 需在该块 cleanup 里补删 `"obs_noacct_user"`，或复用现有 cleanup 的 user 清理列表——实现时确认 afterEach 会清掉该 user，避免污染。）

- [ ] **Step 8: mapper 带出后跑测试 + typecheck**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test dao.test.ts`
Expected: PASS（Step 1 与 Step 7 用例）。
Run: `pnpm --filter @arc/ai-recruitment-copilot-backend typecheck`
Expected: 无错误（平台 mapper 因 Step 5 补列而类型自洽）。

- [ ] **Step 9: 平台路径回归断言**（守住平台补列——防后续删列致 mapper 断裂）

```ts
it("platform rows also carry the new counts (mapper type parity)", async () => {
  const accountId = await insertTestAccount();
  await db
    .insert(mailIngestMessage)
    .values([
      { accountId, id: "mp_fail", mailbox: "INBOX", status: "failed", uid: "9", uidValidity: "1" },
    ]);
  const { records } = await queryPaginatedPlatformMailIngestAccounts();
  const row = records.find((r) => r.account?.id === accountId);
  expect(row?.messageCount).toBe(1);
  expect(row?.problemCount).toBe(1);
}, 30_000);
```

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test dao.test.ts`
Expected: PASS。

- [ ] **Step 10: Commit**

```bash
git add apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/dao.ts apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/__tests__/dao.test.ts
git commit -m "feat(mail-ingest): project messageCount/problemCount/lastRun* on account list rows"
```

---

## Task 2: messages DAO 补 `errorMessage`（后端截断 + 单行化）

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/dao.ts`（`MailMessageLogRecord` 约 1046-1059、`listAccountMailMessages` 的第二个 `.select({...})` 约 1193-1205、records 映射 约 1226-1242；新增顶部常量 + 截断 helper）
- Test: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/__tests__/dao.test.ts`

**Interfaces:**

- Produces: `MailMessageLogRecord.errorMessage: string | null`（已截断+单行化），`listAccountMailMessages` 返回，两端（managed + 自助）一致。

- [ ] **Step 1: 写失败测试**（追加到 log/messages describe 块；用该块的 org 常量与建 message 模式）

```ts
it("projects errorMessage truncated + single-lined on failed rows", async () => {
  const accountId = await insertTestAccount();
  await db.insert(mailIngestMessage).values({
    accountId,
    errorMessage: `IMAP fetch failed\nstack line 2\n${"x".repeat(400)}`,
    id: "m_err",
    mailbox: "INBOX",
    status: "failed",
    uid: "1",
    uidValidity: "1",
  });

  const { records } = await listAccountMailMessages({
    accountId,
    organizationId: OBS_ORG,
    page: 1,
    pageSize: 20,
  });

  expect(records[0]?.errorMessage).not.toContain("\n");
  expect(records[0]?.errorMessage?.startsWith("IMAP fetch failed stack line 2")).toBe(true);
  expect((records[0]?.errorMessage ?? "").length).toBeLessThanOrEqual(301); // 300 + "…"
}, 30_000);
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test dao.test.ts`
Expected: FAIL —`records[0].errorMessage` 为 `undefined`。

- [ ] **Step 3: 类型加字段**（`MailMessageLogRecord`，字母序——`errorMessage` 在 `boundJobDescriptionName` 与 `fromAddress` 之间）

```ts
boundJobDescriptionName: string | null;
errorMessage: string | null;
fromAddress: string | null;
```

- [ ] **Step 4: 加常量 + 截断 helper**（dao.ts 顶部常量区，`ERROR_MESSAGE_MAX` 附近加；helper 放在 `summarizePool` 附近的私有函数区）

```ts
const MAIL_MESSAGE_ERROR_DISPLAY_MAX = 300;

function truncateErrorForDisplay(message: string | null): string | null {
  if (!message) {
    return null;
  }
  const oneLine = message.replace(/\s+/g, " ").trim();
  return oneLine.length > MAIL_MESSAGE_ERROR_DISPLAY_MAX
    ? `${oneLine.slice(0, MAIL_MESSAGE_ERROR_DISPLAY_MAX)}…`
    : oneLine;
}
```

- [ ] **Step 5: select 加列 + 映射截断**（`listAccountMailMessages` 第二个 `.select({...})` 字母序插入 `errorMessage: mailIngestMessage.errorMessage,`；records 映射里字母序插入）

```ts
      errorMessage: truncateErrorForDisplay(row.errorMessage),
```

- [ ] **Step 6: 跑测试确认通过 + typecheck**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test dao.test.ts`
Expected: PASS。
Run: `pnpm --filter @arc/ai-recruitment-copilot-backend typecheck`
Expected: 无错误。

- [ ] **Step 7: Commit**

```bash
git add apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/dao.ts apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/__tests__/dao.test.ts
git commit -m "feat(mail-ingest): project truncated single-line errorMessage on message records"
```

---

## Task 3: org 作用域存在性 DAO（非凭证）

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/dao.ts`（新增导出函数，放在 `getMailIngestAccountLoginConfig` 之后，约 715 行后）
- Test: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/__tests__/dao.test.ts`

**Interfaces:**

- Produces: `mailIngestAccountExistsInOrg(input: { id: string; organizationId: string }): Promise<boolean>` — 只按 `id + organizationId` 查，不带 `userId`、不解密。Task 4 用它做 org 作用域校验（含跨组织 404 的真实约束）。

- [ ] **Step 1: 写失败测试**（追加到主 describe 块，用其 `ORG`/`OTHER_ORG`/`"mail_ingest_owner_account"` 种子；先把 `mailIngestAccountExistsInOrg` 加进顶部 `from "../dao"` 导入）

```ts
it("mailIngestAccountExistsInOrg: true same-org, false cross-org/missing", async () => {
  await expect(
    mailIngestAccountExistsInOrg({ id: "mail_ingest_owner_account", organizationId: ORG }),
  ).resolves.toBe(true);
  await expect(
    mailIngestAccountExistsInOrg({ id: "mail_ingest_owner_account", organizationId: OTHER_ORG }),
  ).resolves.toBe(false);
  await expect(
    mailIngestAccountExistsInOrg({ id: "does_not_exist", organizationId: ORG }),
  ).resolves.toBe(false);
}, 30_000);
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test dao.test.ts`
Expected: FAIL —导入报错 / `is not a function`。

- [ ] **Step 3: 实现 DAO**

```ts
export async function mailIngestAccountExistsInOrg({
  id,
  organizationId,
}: {
  id: string;
  organizationId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: mailIngestAccount.id })
    .from(mailIngestAccount)
    .where(and(eq(mailIngestAccount.id, id), eq(mailIngestAccount.organizationId, organizationId)))
    .limit(1);
  return Boolean(row);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test dao.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/dao.ts apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/__tests__/dao.test.ts
git commit -m "feat(mail-ingest): add org-scoped non-credential account existence DAO"
```

---

## Task 4: 新增 `GET /managed/:id/messages`（manage + org）

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/route.ts`（`./dao` 导入加 `mailIngestAccountExistsInOrg`；在 `.patch("/managed/:id", ...)` 之后插入新路由）
- Test: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/__tests__/route.test.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/__tests__/route.permission.test.ts`

**Interfaces:**

- Consumes: `mailIngestAccountExistsInOrg`（Task 3）、`listAccountMailMessages`（Task 2 已含截断 errorMessage）、`listMailMessagesQuerySchema`（schema.ts 已有）。
- Produces: `GET /w/:slug/studio/mail-ingest-accounts/managed/:id/messages` → `{ records: MailMessageLogRecord[]; total: number }`。前端 Task 6 消费 `rpc.api.w[':slug'].studio['mail-ingest-accounts'].managed[':id'].messages.$get`。

> **测试策略说明（诚实标注）**：route.test.ts 现有 harness **模块级 mock 了 `requirePermission`（无条件放行）和 `db`（`{}`）**。因此在该文件里只能验证**路由形状**（org 作用域调用、404）。真实"要求 manage 才放行"由独立 `route.permission.test.ts` 用**真实中间件 + mock `auth.api.hasPermission`** 覆盖（`mailIngestAccount` 不在 `RECRUITING_GROUP_RESOURCES`，中间件必走 `auth.api.hasPermission` 分支）。**跨组织 404 的真实数据约束由 Task 3 的 DAO 测试覆盖**（真实 PG）。三者合起来 = 覆盖 spec 的权限三态；本 harness 不做完整 better-auth 角色矩阵集成（需真 session 种子，超本期）。

- [ ] **Step 1: 写失败测试（mocked：org 作用域 + 404）**（route.test.ts：把 `mailIngestAccountExistsInOrg: vi.fn()` 加进 `vi.hoisted(() => ({...}))`，并在 `vi.mock("../dao", ...)` 返回对象里导出它；`beforeEach` 里 `mocks.mailIngestAccountExistsInOrg.mockResolvedValue(true)`。追加：）

```ts
it("managed messages: manage user drills into any org account (org-scoped, no userId)", async () => {
  mocks.listAccountMailMessages.mockResolvedValue({ records: [{ id: "msg_1" }], total: 1 });

  const res = await app.request("/mail-ingest-accounts/managed/account_9/messages");

  expect(res.status).toBe(200);
  expect(mocks.mailIngestAccountExistsInOrg).toHaveBeenCalledWith({
    id: "account_9",
    organizationId: "org_1",
  });
  expect(mocks.listAccountMailMessages).toHaveBeenCalledWith(
    expect.objectContaining({
      accountId: "account_9",
      organizationId: "org_1",
      page: 1,
      pageSize: 20,
    }),
  );
});

it("managed messages: 404 when account not in org", async () => {
  mocks.mailIngestAccountExistsInOrg.mockResolvedValue(false);

  const res = await app.request("/mail-ingest-accounts/managed/account_x/messages");

  expect(res.status).toBe(404);
  expect(mocks.listAccountMailMessages).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test route.test.ts`
Expected: FAIL —路由未定义，`mailIngestAccountExistsInOrg` 未被调用。

- [ ] **Step 3: 实现路由**（route.ts：`import { ..., mailIngestAccountExistsInOrg } from "./dao"`；在 `.patch("/managed/:id", ...)` 之后插入）

```ts
  .get(
    "/managed/:id/messages",
    requirePermission("mailIngestAccount", "manage"),
    zValidator("query", listMailMessagesQuerySchema, jsonValidatorError("查询参数不合法")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const accountId = c.req.param("id");
      const exists = await mailIngestAccountExistsInOrg({
        id: accountId,
        organizationId: activeOrg.id,
      });
      if (!exists) {
        return c.json({ error: "邮箱配置不存在。" }, 404);
      }
      const q = c.req.valid("query");
      const result = await listAccountMailMessages({
        accountId,
        organizationId: activeOrg.id,
        ...q,
      });
      return c.json(result, 200);
    },
  )
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test route.test.ts`
Expected: PASS。

- [ ] **Step 5: 写真实中间件权限测试**（新建 `__tests__/route.permission.test.ts`——不 mock 权限模块，mock `auth.api.hasPermission` 驱动真实 `requirePermission`）

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";

const mocks = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  listAccountMailMessages: vi.fn(),
  mailIngestAccountExistsInOrg: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({ db: {} }));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/auth", () => ({
  auth: { api: { hasPermission: mocks.hasPermission } },
}));
vi.mock("../dao", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../dao")>()),
  listAccountMailMessages: mocks.listAccountMailMessages,
  mailIngestAccountExistsInOrg: mocks.mailIngestAccountExistsInOrg,
}));

const { mailIngestRouter } = await import("../route");

const app = factory
  .createApp()
  .use(async (c, next) => {
    c.set("activeOrg", { id: "org_1" } as never);
    c.set("member", { role: "admin" } as never);
    c.set("user", { id: "admin_1" } as never);
    await next();
  })
  .route("/mail-ingest-accounts", mailIngestRouter);

describe("managed messages permission (real middleware)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mailIngestAccountExistsInOrg.mockResolvedValue(true);
    mocks.listAccountMailMessages.mockResolvedValue({ records: [], total: 0 });
  });

  it("denies (403) and requires manage when hasPermission fails", async () => {
    mocks.hasPermission.mockResolvedValue({ success: false });

    const res = await app.request("/mail-ingest-accounts/managed/account_1/messages");

    expect(res.status).toBe(403);
    expect(mocks.hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: { permissions: { mailIngestAccount: ["manage"] } } }),
    );
    expect(mocks.listAccountMailMessages).not.toHaveBeenCalled();
  });

  it("allows (200) when hasPermission succeeds", async () => {
    mocks.hasPermission.mockResolvedValue({ success: true });
    const res = await app.request("/mail-ingest-accounts/managed/account_1/messages");
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 6: 跑权限测试 + typecheck**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test route.permission.test.ts`
Expected: PASS（403 与 200 各一）。
Run: `pnpm --filter @arc/ai-recruitment-copilot-backend typecheck`
Expected: 无错误。

- [ ] **Step 7: Commit**

```bash
git add apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/route.ts apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/__tests__/route.test.ts apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/__tests__/route.permission.test.ts
git commit -m "feat(mail-ingest): add manage-scoped GET /managed/:id/messages route"
```

---

## Task 5: 日志抽屉组件 — 外壳 + 上轮小结（启发式）

**Files:**

- Create: `apps/ai-recruitment-copilot/src/components/features/studio/mail-ingest/mail-ingest-log-drawer.tsx`
- Test: `apps/ai-recruitment-copilot/src/components/features/studio/mail-ingest/mail-ingest-log-drawer.test.tsx`

**Interfaces:**

- Produces:
  - `renderRunSummary(account): { label: string; showCounts: boolean; error: string | null }`（导出纯函数）。
  - `MailIngestLogAccount` 接口（抽屉所需账号子集）。
  - `MailIngestLogDrawer` 组件 props `{ account: MailIngestLogAccount | null; slug: string; open: boolean; onOpenChange: (open: boolean) => void }`。Task 6 在此组件内加消息表，Task 7 挂载（并按账号 `key` remount）。

- [ ] **Step 1: 写失败测试（小结启发式，含 nullable→0）**

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderRunSummary } from "./mail-ingest-log-drawer";

describe("renderRunSummary", () => {
  const zero = {
    lastRunFailed: 0,
    lastRunMatched: 0,
    lastRunQueued: 0,
    lastRunReceived: 0,
    lastRunSubjectSkipped: 0,
  };

  it("never polled → 尚未轮询, no counts", () => {
    expect(renderRunSummary({ ...zero, lastCheckedAt: null, lastError: null })).toMatchObject({
      label: "尚未轮询",
      showCounts: false,
    });
  });

  it("checked + error + all-zero → 最近轮询失败, no counts, error passed", () => {
    const r = renderRunSummary({
      ...zero,
      lastCheckedAt: "2026-07-10T00:00:00.000Z",
      lastError: "IMAP down",
    });
    expect(r).toMatchObject({
      error: "IMAP down",
      label: "最近轮询失败，暂无成功快照",
      showCounts: false,
    });
  });

  it("has snapshot (nullable counts) → show counts", () => {
    const r = renderRunSummary({
      lastCheckedAt: "2026-07-10T00:00:00.000Z",
      lastError: null,
      lastRunFailed: null,
      lastRunMatched: null,
      lastRunQueued: null,
      lastRunReceived: 5,
      lastRunSubjectSkipped: null,
    });
    expect(r).toMatchObject({ label: "上轮快照", showCounts: true });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot test mail-ingest-log-drawer`
Expected: FAIL —模块/导出不存在。

- [ ] **Step 3: 建组件文件 — 类型 + 纯函数 + 外壳 + 小结**

```tsx
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface MailIngestLogAccount {
  emailAddress: string;
  id: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  lastRunFailed: number | null;
  lastRunMatched: number | null;
  lastRunQueued: number | null;
  lastRunReceived: number | null;
  lastRunSubjectSkipped: number | null;
}

export function renderRunSummary(account: {
  lastCheckedAt: string | null;
  lastError: string | null;
  lastRunFailed: number | null;
  lastRunMatched: number | null;
  lastRunQueued: number | null;
  lastRunReceived: number | null;
  lastRunSubjectSkipped: number | null;
}): { error: string | null; label: string; showCounts: boolean } {
  if (account.lastCheckedAt === null) {
    return { error: null, label: "尚未轮询", showCounts: false };
  }
  const allZero =
    !account.lastRunReceived &&
    !account.lastRunSubjectSkipped &&
    !account.lastRunMatched &&
    !account.lastRunQueued &&
    !account.lastRunFailed;
  if (account.lastError && allZero) {
    return { error: account.lastError, label: "最近轮询失败，暂无成功快照", showCounts: false };
  }
  return { error: account.lastError, label: "上轮快照", showCounts: true };
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
  const min = Math.round(diffMs / 60000);
  if (Math.abs(min) < 60) {
    return rtf.format(-min, "minute");
  }
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) {
    return rtf.format(-hr, "hour");
  }
  return rtf.format(-Math.round(hr / 24), "day");
}

export function MailIngestLogDrawer({
  account,
  onOpenChange,
  open,
  slug,
}: {
  account: MailIngestLogAccount | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  slug: string;
}) {
  const summary = account ? renderRunSummary(account) : null;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <SheetHeader className="border-border border-b px-6 pt-6 pb-4">
          <SheetTitle>入库记录</SheetTitle>
          <SheetDescription>{account?.emailAddress ?? null}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 p-6">
          {account && summary ? (
            <section className="space-y-1">
              <p className="font-medium text-sm">{summary.label}</p>
              {summary.showCounts ? (
                <p className="text-muted-foreground text-sm">
                  {`收到${account.lastRunReceived ?? 0} · 标题不符${account.lastRunSubjectSkipped ?? 0} · 命中${account.lastRunMatched ?? 0} · 入队${account.lastRunQueued ?? 0} · 失败${account.lastRunFailed ?? 0}`}
                </p>
              ) : null}
              {account.lastCheckedAt ? (
                <p className="text-muted-foreground text-xs">
                  {`最近检查：${formatRelative(account.lastCheckedAt)}`}
                </p>
              ) : null}
              {summary.error ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
                  {summary.error}
                </p>
              ) : null}
            </section>
          ) : null}
          {/* MailIngestLogMessages 表在 Task 6 加入此处 */}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: 跑测试通过 + typecheck + lint**

Run: `pnpm --filter @arc/ai-recruitment-copilot test mail-ingest-log-drawer`
Expected: PASS。
Run: `pnpm --filter @arc/ai-recruitment-copilot typecheck`
Expected: 无错误。
Run: `pnpm fix`

- [ ] **Step 5: Commit**

```bash
git add apps/ai-recruitment-copilot/src/components/features/studio/mail-ingest/
git commit -m "feat(mail-ingest): log drawer shell + last-run summary heuristic"
```

---

## Task 6: 抽屉消息表 — 筛选控件 + 表 + 附件展开 + 三态

**Files:**

- Modify: `apps/ai-recruitment-copilot/src/components/features/studio/mail-ingest/mail-ingest-log-drawer.tsx`
- Test: `apps/ai-recruitment-copilot/src/components/features/studio/mail-ingest/mail-ingest-log-drawer.test.tsx`

**Interfaces:**

- Consumes: `GET /managed/:id/messages`（Task 4）。
- Produces: `serializeDateRange(from, to)` 导出纯函数；抽屉内 `MailIngestLogMessages` 子组件（状态单选 + 关键词输入 + 起止日期输入 + 清除筛选、分页、加载骨架/错误重试/空态区分、六列表 + 状态 Badge + 附件行展开）。

> **remount 契约**：本组件的筛选/分页状态是内部 `useState`；Task 7 用 `key={account.id}` 挂载抽屉，账号切换即 remount → 状态自动重置、且不会串上一账号数据（**因此不使用 `keepPreviousData`**）。

- [ ] **Step 1: 写失败测试（serializeDateRange + 表渲染）**（追加到 test 文件；mock `@/lib/client/api` 的 `rpcFetch`）

```tsx
import { serializeDateRange } from "./mail-ingest-log-drawer";

describe("serializeDateRange", () => {
  it("from → local day start, to → local day end; from>to throws", () => {
    const r = serializeDateRange("2026-07-01", "2026-07-02");
    expect(r.receivedFrom).toBe(new Date(2026, 6, 1, 0, 0, 0, 0).toISOString());
    expect(r.receivedTo).toBe(new Date(2026, 6, 2, 23, 59, 59, 999).toISOString());
    expect(() => serializeDateRange("2026-07-03", "2026-07-01")).toThrow();
  });
});
```

表渲染断言（参照 `apps/ai-recruitment-copilot/src/components/features/platform/queues/queues-grid.test.tsx` 的 jsdom + `createRoot`/`act` + `QueryClientProvider`+`TooltipProvider` 范式；mock `@/lib/client/api` 的 `rpcFetch` 返回下列数据；对 `document.body.textContent` 断言）：

```tsx
// rpcFetch mock 返回：
// { records: [
//   { id:"a", status:"failed", errorMessage:"boom", subject:null, fromAddress:null,
//     receivedAt:null, attachmentCount:2, resumeAttachmentCount:1, poolSummary:null,
//     jdBindStatus:null, boundJobDescriptionName:null, attachments:[] },
//   { id:"b", status:"skipped", skipReason:"no_supported_attachment",
//     attachments:[{ fileName:"x.pdf", resumeParseStatus:"failed", resumeParseError:"bad", hasDuplicate:true }] },
// ], total: 2 }
// 断言：
// - failed 行文本含 "boom"；skipped 行含 "no_supported_attachment"
// - subject 为 null 的行显示 "（无主题）"；receivedAt 为 null 显示 "—"
// - 附件列显示 "1/2"
// - 展开第二行后，出现 "x.pdf" 与 "bad"（解析错误）
// - total=0 且无筛选 → "该邮箱暂无入库记录"；total=0 且有筛选 → "当前筛选条件下无匹配邮件"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot test mail-ingest-log-drawer`
Expected: FAIL —`serializeDateRange` 未导出 / 表未渲染。

- [ ] **Step 3: 加导入 + 常量 + 类型 + serializeDateRange**（组件文件顶部）

```tsx
import { useQuery } from "@tanstack/react-query"; // 不使用 keepPreviousData（见 remount 契约）
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { Badge } from "@/components/ui/badge";

interface MailMessageAttachment {
  fileName: string;
  hasDuplicate: boolean;
  resumeParseError: string | null;
  resumeParseStatus: string | null;
}
interface MailMessageRecord {
  attachmentCount: number | null;
  attachments: MailMessageAttachment[];
  boundJobDescriptionName: string | null;
  errorMessage: string | null;
  fromAddress: string | null;
  id: string;
  jdBindStatus: string | null;
  poolSummary: string | null;
  receivedAt: string | null;
  resumeAttachmentCount: number | null;
  skipReason: string | null;
  status: "failed" | "processing" | "queued" | "skipped";
  subject: string | null;
}

const PAGE_SIZE = 20;
type StatusFilter = "" | "failed" | "processing" | "queued" | "skipped";
const STATUS_OPTIONS: StatusFilter[] = ["", "queued", "skipped", "failed", "processing"];

export function serializeDateRange(
  from: string | null,
  to: string | null,
): { receivedFrom?: string; receivedTo?: string } {
  const out: { receivedFrom?: string; receivedTo?: string } = {};
  let fromDate: Date | null = null;
  let toDate: Date | null = null;
  if (from) {
    const [y, m, d] = from.split("-").map(Number);
    fromDate = new Date(y, m - 1, d, 0, 0, 0, 0);
    out.receivedFrom = fromDate.toISOString();
  }
  if (to) {
    const [y, m, d] = to.split("-").map(Number);
    toDate = new Date(y, m - 1, d, 23, 59, 59, 999);
    out.receivedTo = toDate.toISOString();
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw new Error("起始日期不能晚于结束日期");
  }
  return out;
}
```

（`sonner` 的 `toast` 是本仓库 toast 方案；`Badge` 路径 `@/components/ui/badge`。）

- [ ] **Step 4: 实现 `MailIngestLogMessages` 子组件**（同文件新增；`MailIngestLogDrawer` 用 `{account ? <MailIngestLogMessages account={account} slug={slug} /> : null}` 替换 Task 5 的占位注释）

```tsx
function statusVariant(status: MailMessageRecord["status"]) {
  if (status === "failed") return "destructive";
  if (status === "skipped") return "outline";
  if (status === "processing") return "secondary";
  return "default";
}

function MailIngestLogMessages({ account, slug }: { account: MailIngestLogAccount; slug: string }) {
  const [status, setStatus] = useState<StatusFilter>("");
  const [keyword, setKeyword] = useState("");
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const hasFilters = Boolean(status || keyword || from || to);

  function resetToFirstPage() {
    setPage(1);
  }

  const query = useQuery({
    enabled: !dateError,
    queryFn: () => {
      const range = serializeDateRange(from, to);
      return rpcFetch<{ records: MailMessageRecord[]; total: number }>(
        rpc.api.w[":slug"].studio["mail-ingest-accounts"].managed[":id"].messages.$get({
          param: { id: account.id, slug },
          query: {
            page: String(page),
            pageSize: String(PAGE_SIZE),
            ...(status ? { status } : {}),
            ...(keyword ? { keyword } : {}),
            ...(range.receivedFrom ? { receivedFrom: range.receivedFrom } : {}),
            ...(range.receivedTo ? { receivedTo: range.receivedTo } : {}),
          },
        }),
        "加载入库记录失败",
      );
    },
    queryKey: ["mail-ingest-messages", slug, account.id, { from, keyword, status, to }, page],
  });

  function applyDates(nextFrom: string | null, nextTo: string | null) {
    try {
      serializeDateRange(nextFrom, nextTo);
      setDateError(null);
    } catch (e) {
      setDateError(e instanceof Error ? e.message : "日期不合法");
    }
    setFrom(nextFrom);
    setTo(nextTo);
    resetToFirstPage();
  }

  // 错误 toast 放 effect，避免在 render body 里每次渲染都触发（内联重试见下方三态分支）
  useEffect(() => {
    if (query.isError) {
      toast.error(query.error instanceof Error ? query.error.message : "加载入库记录失败");
    }
  }, [query.isError, query.error]);

  const records = query.data?.records ?? [];
  const total = query.data?.total ?? 0;

  return (
    <section className="space-y-3">
      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_OPTIONS.map((opt) => (
          <button
            className={status === opt ? "font-semibold underline" : "text-muted-foreground"}
            key={opt || "all"}
            onClick={() => {
              setStatus(opt);
              resetToFirstPage();
            }}
            type="button"
          >
            {opt === "" ? "全部" : opt}
          </button>
        ))}
        <input
          aria-label="关键词"
          className="rounded border px-2 py-1 text-sm"
          onChange={(e) => {
            setKeyword(e.target.value);
            resetToFirstPage();
          }}
          placeholder="主题或发件人"
          value={keyword}
        />
        <input
          aria-label="起始日期"
          className="rounded border px-2 py-1 text-sm"
          onChange={(e) => applyDates(e.target.value || null, to)}
          type="date"
          value={from ?? ""}
        />
        <input
          aria-label="结束日期"
          className="rounded border px-2 py-1 text-sm"
          onChange={(e) => applyDates(from, e.target.value || null)}
          type="date"
          value={to ?? ""}
        />
        {hasFilters ? (
          <button
            onClick={() => {
              setStatus("");
              setKeyword("");
              setFrom(null);
              setTo(null);
              setDateError(null);
              resetToFirstPage();
            }}
            type="button"
          >
            清除筛选
          </button>
        ) : null}
      </div>
      {dateError ? <p className="text-destructive text-xs">{dateError}</p> : null}

      {/* 三态：加载 / 错误 / 内容 */}
      {query.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div className="h-8 animate-pulse rounded bg-muted" key={i} />
          ))}
        </div>
      ) : query.isError ? (
        <div className="space-y-2 text-sm">
          <p className="text-destructive">加载入库记录失败</p>
          <button onClick={() => query.refetch()} type="button">
            重试
          </button>
        </div>
      ) : records.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {hasFilters ? "当前筛选条件下无匹配邮件" : "该邮箱暂无入库记录"}
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-muted-foreground">
              <th>收到时间</th>
              <th>状态</th>
              <th>JD绑定</th>
              <th>附件</th>
              <th>主题</th>
              <th>发件人</th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec) => (
              <>
                <tr key={rec.id}>
                  <td>{rec.receivedAt ? new Date(rec.receivedAt).toLocaleString() : "—"}</td>
                  <td>
                    <Badge variant={statusVariant(rec.status)}>{rec.status}</Badge>
                  </td>
                  <td>
                    {rec.boundJobDescriptionName ?? "—"}
                    {rec.jdBindStatus ? (
                      <span className="ml-1 text-muted-foreground text-xs">{rec.jdBindStatus}</span>
                    ) : null}
                  </td>
                  <td>
                    {`${rec.resumeAttachmentCount ?? "—"}/${rec.attachmentCount ?? "—"}`}
                    {rec.poolSummary ? (
                      <span className="ml-1 text-muted-foreground text-xs">{rec.poolSummary}</span>
                    ) : null}
                    {rec.attachments.length > 0 ? (
                      <button
                        aria-label="展开附件"
                        className="ml-1 text-xs underline"
                        onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}
                        type="button"
                      >
                        {expanded === rec.id ? "收起" : "展开"}
                      </button>
                    ) : null}
                  </td>
                  <td>{rec.subject ?? "（无主题）"}</td>
                  <td>{rec.fromAddress ?? "—"}</td>
                </tr>
                {rec.status === "failed" && rec.errorMessage ? (
                  <tr key={`${rec.id}-err`}>
                    <td className="text-destructive" colSpan={6}>
                      {rec.errorMessage}
                    </td>
                  </tr>
                ) : null}
                {rec.status === "skipped" && rec.skipReason ? (
                  <tr key={`${rec.id}-skip`}>
                    <td className="text-muted-foreground" colSpan={6}>
                      {rec.skipReason}
                    </td>
                  </tr>
                ) : null}
                {expanded === rec.id ? (
                  <tr key={`${rec.id}-att`}>
                    <td colSpan={6}>
                      <ul className="space-y-1">
                        {rec.attachments.map((att) => (
                          <li key={att.fileName}>
                            {att.fileName}
                            {att.resumeParseStatus ? ` · ${att.resumeParseStatus}` : ""}
                            {att.resumeParseError ? (
                              <span className="text-destructive"> · {att.resumeParseError}</span>
                            ) : null}
                            {att.hasDuplicate ? (
                              <span className="text-muted-foreground"> · 疑似重复</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ) : null}
              </>
            ))}
          </tbody>
        </table>
      )}

      {/* 分页 */}
      <div className="flex items-center justify-between">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} type="button">
          上一页
        </button>
        <span className="text-muted-foreground text-xs">{`共 ${total} 封`}</span>
        <button
          disabled={page * PAGE_SIZE >= total}
          onClick={() => setPage((p) => p + 1)}
          type="button"
        >
          下一页
        </button>
      </div>
    </section>
  );
}
```

（注：`<> ... </>` 片段在 `.map` 中需 `key`——将 `<>` 换成 `<Fragment key={rec.id}>`（`import { Fragment } from "react"`）以满足 key 规则；上面为可读性用简写，实现时改 `Fragment`。）

- [ ] **Step 5: 跑测试通过 + typecheck + lint**

Run: `pnpm --filter @arc/ai-recruitment-copilot test mail-ingest-log-drawer`
Expected: PASS（serializeDateRange + 表渲染/展开/空态）。
Run: `pnpm --filter @arc/ai-recruitment-copilot typecheck`
Expected: 无错误。
Run: `pnpm fix`

- [ ] **Step 6: Commit**

```bash
git add apps/ai-recruitment-copilot/src/components/features/studio/mail-ingest/
git commit -m "feat(mail-ingest): drawer message table with filters, pagination, attachments, states"
```

---

## Task 7: 挂载抽屉到账号页 + 徽章列 + 派生 + 双失效

**Files:**

- Modify: `apps/ai-recruitment-copilot/src/routes/w.$slug.studio.mail-ingest-accounts.tsx`

**Interfaces:**

- Consumes: `MailIngestLogDrawer`（Task 5/6）。
- Produces: 内联行类型扩展；徽章列（`account===null` → `—`，否则可点 `<button>`）；`selectedAccountId` 状态；抽屉按 `key={selectedAccountId}` remount。

- [ ] **Step 1: 扩展内联行类型**（`ManagedMailIngestRow`，字母序插入）

```tsx
interface ManagedMailIngestRow {
  account: MailIngestAccountRecord | null;
  lastRunFailed: number | null;
  lastRunMatched: number | null;
  lastRunQueued: number | null;
  lastRunReceived: number | null;
  lastRunSubjectSkipped: number | null;
  messageCount: number;
  problemCount: number;
  user: {
    email: string;
    id: string;
    image: string | null;
    name: string;
    role: string;
  };
}
```

- [ ] **Step 2: 导入抽屉 + 加状态与派生**（文件顶部 `import { MailIngestLogDrawer } from "@/components/features/studio/mail-ingest/mail-ingest-log-drawer"`；组件函数体内、`columns` 定义之前）

```tsx
const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

const selectedRow =
  selectedAccountId === null
    ? null
    : (grid.data.records.find((r) => r.account?.id === selectedAccountId) ?? null);

const selectedLogAccount = selectedRow?.account
  ? {
      emailAddress: selectedRow.account.emailAddress,
      id: selectedRow.account.id,
      lastCheckedAt: selectedRow.account.lastCheckedAt,
      lastError: selectedRow.account.lastError,
      lastRunFailed: selectedRow.lastRunFailed,
      lastRunMatched: selectedRow.lastRunMatched,
      lastRunQueued: selectedRow.lastRunQueued,
      lastRunReceived: selectedRow.lastRunReceived,
      lastRunSubjectSkipped: selectedRow.lastRunSubjectSkipped,
    }
  : null;
```

（`grid` 由 `useDataGridState` 返回，`grid.data.records` 是当前列表记录——顶部数据从列表结果派生，列表刷新后自动更新。`useState` 已在该文件导入。）

- [ ] **Step 3: 徽章列**（`columns` 数组新增 `customColumn`，放在 "status" 列后）

```tsx
      customColumn<ManagedMailIngestRow>({
        cell: (row) => {
          if (!row.account) {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <button
              aria-label={`查看 ${row.account.emailAddress} 的入库记录`}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm hover:bg-muted focus-visible:outline-2"
              onClick={() => setSelectedAccountId(row.account?.id ?? null)}
              type="button"
            >
              <span>{row.messageCount}</span>
              {row.problemCount > 0 ? (
                <span className="text-destructive">·{row.problemCount}</span>
              ) : null}
            </button>
          );
        },
        key: "messageLog",
        title: "入库记录",
      }),
```

- [ ] **Step 4: 挂载抽屉（按 account key remount）**（页面 return 的 `<DataGrid .../>` 之后）

```tsx
<MailIngestLogDrawer
  account={selectedLogAccount}
  key={selectedAccountId ?? "none"}
  onOpenChange={(next) => {
    if (!next) {
      setSelectedAccountId(null);
    }
  }}
  open={selectedAccountId !== null}
  slug={slug}
/>
```

（`key={selectedAccountId}` 使切换账号即 remount 抽屉 → 内部筛选/分页状态重置、不串上一账号数据。）

- [ ] **Step 5: 抽屉内手动刷新（双失效）**（在 Task 6 的 `MailIngestLogMessages` 顶部筛选栏加"刷新"按钮，同时失效邮件表与账号列表两查询）

```tsx
// MailIngestLogMessages 内：import { useQueryClient } from "@tanstack/react-query"
const queryClient = useQueryClient();
async function refresh() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["mail-ingest-messages", slug, account.id] }),
    queryClient.invalidateQueries({ queryKey: ["managed-mail-ingest-accounts", slug] }),
  ]);
}
```

```tsx
<button onClick={refresh} type="button">
  刷新
</button>
```

- [ ] **Step 6: typecheck + lint + 前端测试**

Run: `pnpm --filter @arc/ai-recruitment-copilot typecheck`
Expected: 无错误（抽屉组件已存在，无未定义引用）。
Run: `pnpm fix`
Run: `pnpm --filter @arc/ai-recruitment-copilot test mail-ingest-log-drawer`
Expected: PASS。

- [ ] **Step 7: 徽章 + 接线组件测试**（在 drawer test 里补：因徽章列在页面文件内联，测试可对**抽屉**层验证接线；徽章渲染逻辑抽一个小纯函数或在页面测试中覆盖。最小闭环——补以下断言）

```tsx
// 1) 徽章：account===null 行渲染 "—" 且无 button；account!==null 渲染 button（Enter/Space 可触发、有 focus 样式）。
//    若为此在页面文件抽出 renderMessageBadge(row) 纯函数，则单测它；否则在页面组件测试里断言。
// 2) 打开抽屉：给定 selectedLogAccount，顶部展示派生的小结文案（对应 renderRunSummary 分支）。
// 3) refresh() 调用 invalidateQueries 两次：一次前缀 ["managed-mail-ingest-accounts", slug]，
//    一次 ["mail-ingest-messages", slug, account.id]（mock useQueryClient 断言调用）。
```

Run: `pnpm --filter @arc/ai-recruitment-copilot test mail-ingest-log-drawer`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add apps/ai-recruitment-copilot/src/routes/w.$slug.studio.mail-ingest-accounts.tsx apps/ai-recruitment-copilot/src/components/features/studio/mail-ingest/
git commit -m "feat(mail-ingest): wire log drawer into account page with badge + derived summary + dual-invalidate refresh"
```

---

## 收尾验证

- [ ] **性能联调**（spec 要求的性能门槛，无硬数值但须观察）：确认 `mail_ingest_message.account_id` 有索引（Plan A 应已建；`\d mail_ingest_message` 查）。在有代表性数据的库上对 `/managed` 列表底层查询跑 `EXPLAIN ANALYZE`，确认两个标量子查询走 `account_id` 索引而非顺序扫；若明显退化，记录并评估"一次 `group by account_id` 聚合后 join"替代。
- [ ] **后端全量**：`pnpm --filter @arc/ai-recruitment-copilot-backend test mail-ingest` → 全绿。
- [ ] **前端全量**：`pnpm --filter @arc/ai-recruitment-copilot test mail-ingest-log-drawer` → 全绿。
- [ ] **双端 typecheck**：两个 `typecheck` 命令均无错误。
- [ ] **Lint**：`pnpm check` 无新增告警。
- [ ] **手测**（可选）：本地起 web，工作区账号页——未配置成员行显示 `—`（不可点）；已配置账号点徽章 → 抽屉打开 → 上轮小结按启发式显示对应文案 → 逐封表可按状态/关键词/日期筛选、翻页、展开附件、看失败原因；`messageCount=0` 的账号仍能打开抽屉看 `lastError`；切换账号抽屉状态重置、不串数据。

## 残留风险 / 已知边界（如实声明）

- **`errorMessage` 脱敏仅截断+单行化**，未做深度正则清洗（连接串/令牌/响应体）；截断后仍可能含少量内部错误文本。深度脱敏留作独立加固。
- **标题不匹配邮件不进逐封表**（worker 不建行），只在上轮小结的 `lastRunSubjectSkipped` 聚合呈现。
- **`problemCount` 为历史累计 failed+skipped**，终态不自愈，账号出过问题后徽章持续红标；不含 queued 邮件的附件级失败。
- **权限测试**：`route.permission.test.ts` 用 mock `auth.api.hasPermission` + 真实中间件验证"路由要求 manage"；跨组织由 Task 3 DAO 真实约束覆盖；未做完整 better-auth 角色矩阵集成。
