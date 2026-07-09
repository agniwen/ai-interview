# 邮件入库可观测性（后端）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把邮件入库链路当前的静默失败/跳过采集成可查询的观测数据——`mail_ingest_message` 逐封记录终态/原因/JD绑定/附件数，`mail_ingest_account` 记本轮小结，并提供按账号下钻的信件日志查询 API（含下游解析/入池状态）。

**Architecture:** 就地增强 `mail_ingest_message`（加列）+ worker 采集点改造（`processor.ts`）+ DAO 写入/查询 + 工作区/平台两个 messages 端点。前端日志 UI 是独立的后续 Plan B（消费本 API）。

**Tech Stack:** TypeScript、Drizzle ORM（PostgreSQL）、Hono、Vitest、pnpm monorepo（`@arc/db-schema`、后端 `@arc/ai-recruitment-copilot-backend`、worker `apps/ai-recruitment-copilot-worker`）。

**Spec:** `docs/adr/2026-07-09-mail-ingest-observability-design.md`

## Global Constraints

- 枚举列一律 `text().$type<Enum>()` + 应用层 union，**不加 DB check**（沿用现有 `MailIngestMessageStatus` 落库方式），未知值兜底 `null`。
- 本期**只观测、不改绑定行为**：`jdBindStatus` 由现有 `resolveMailJobBinding` 已算出的中间值派生，不新增抽码/匹配逻辑、不改变绑定动作。
- 「无受支持附件」= `status=skipped` + `skipReason=no_supported_attachment`（当前是 throw→failed，必须改）。
- `mail_ingest_message` 复合唯一键为 `(accountId, mailbox, uidValidity, uid)`，行只创建一次；重复命中 no-op 不覆盖。
- 「1 邮件=1 batch=N 附件」**仅对建了 batch 的邮件成立**；无附件跳过 `batchId=null`，查询须容空。
- 列表查询**两步分页**：先对 message 分页，再按本页 `batchId` 批量取附件——不 JOIN 后分页。
- 排序 `receivedAt DESC NULLS LAST, id DESC`。
- 权限沿用 `mailIngestAccount`；org 作用域施加到所有涉及表（message/batch/pool）。
- 提交用 conventional commits；每任务结束跑对应测试到绿。
- 数据库迁移：改 `packages/db-schema/src/schema.ts` 后用 `pnpm db:generate` 生成迁移文件（勿手写 SQL）。

---

## File Structure

**改：**

- `packages/db-schema/src/schema.ts` — `mailIngestMessage` 加 6 列 + 新索引；`mailIngestAccount` 加 5 个计数列。
- `packages/db-schema/src/schema.ts`（同文件顶部枚举区）— 新增 `MailIngestSkipReason`、`MailIngestJdBindStatus` 类型。
- `apps/ai-recruitment-copilot-worker/src/mail-ingest/job-binding.ts` — **新建**：纯函数 `deriveJdBindStatus`。
- `apps/ai-recruitment-copilot-worker/src/mail-ingest/processor.ts` — `resolveMailJobBinding` 返回观测数据；`createBatchForMail` 无附件返回 `null` 不抛；`processMailForAccount` 写观测 + skip；per-account 计数。
- `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/dao.ts` — 扩 `updateMailIngestMessageResult`、加 `markMailIngestMessageSkipped`、扩 `finishMailIngestAccountRun`、加 `listAccountMailMessages`。
- `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/schema.ts` — messages 查询参数 zod。
- `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/route.ts` — 加 `GET /:id/messages`（工作区自助）。
- 平台端 messages 端点：`apps/ai-recruitment-copilot/src/lib/start/platform/mail-ingest-accounts.functions.ts`（复用现有 platform server function 层）。

**新建测试：**

- `apps/ai-recruitment-copilot-worker/src/mail-ingest/job-binding.test.ts`
- 扩 `apps/ai-recruitment-copilot-worker/src/mail-ingest/processor-run.test.ts`（或新增用例）
- 扩 `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/__tests__/dao.test.ts`
- 扩 `.../mail-ingest/__tests__/route.test.ts`

---

## Task 1: Schema 加列 + 枚举 + 迁移

**Files:**

- Modify: `packages/db-schema/src/schema.ts`（`mailIngestMessage` ~1416-1450、`mailIngestAccount` ~1361-1414、枚举区 ~1263）

**Interfaces:**

- Produces:
  - `type MailIngestSkipReason = "no_supported_attachment"`
  - `type MailIngestJdBindStatus = "bound" | "unmatched" | "ambiguous" | "fallback"`
  - `mailIngestMessage` 新列：`skipReason, jdBindStatus, boundJobDescriptionId, extractedJobCodes, attachmentCount, resumeAttachmentCount`
  - `mailIngestAccount` 新列：`lastRunReceived, lastRunSubjectSkipped, lastRunMatched, lastRunQueued, lastRunFailed`

- [ ] **Step 1: 加枚举类型**（在 `MailIngestMessageStatus`（~1263）下方）

```ts
export type MailIngestSkipReason = "no_supported_attachment";
export type MailIngestJdBindStatus = "bound" | "unmatched" | "ambiguous" | "fallback";
```

- [ ] **Step 2: `mailIngestMessage` 加列**（在 `status` 列后、闭合 `}` 前的列区内加入；imports 已有 `jsonb`/`integer`/`text` 则复用）

```ts
    skipReason: text("skip_reason").$type<MailIngestSkipReason>(),
    jdBindStatus: text("jd_bind_status").$type<MailIngestJdBindStatus>(),
    boundJobDescriptionId: text("bound_job_description_id").references(() => jobDescription.id, {
      onDelete: "set null",
    }),
    extractedJobCodes: jsonb("extracted_job_codes").$type<string[]>(),
    attachmentCount: integer("attachment_count"),
    resumeAttachmentCount: integer("resume_attachment_count"),
```

- [ ] **Step 3: `mailIngestMessage` 加索引**（在其 `(table) => [ ... ]` 数组内追加）

```ts
    index("mail_ingest_message_account_received_idx").on(table.accountId, table.receivedAt.desc()),
```

- [ ] **Step 4: `mailIngestAccount` 加计数列**（列区内加入）

```ts
    lastRunReceived: integer("last_run_received").notNull().default(0),
    lastRunSubjectSkipped: integer("last_run_subject_skipped").notNull().default(0),
    lastRunMatched: integer("last_run_matched").notNull().default(0),
    lastRunQueued: integer("last_run_queued").notNull().default(0),
    lastRunFailed: integer("last_run_failed").notNull().default(0),
```

- [ ] **Step 5: 确认 imports**

确认 `schema.ts` 顶部已从 `drizzle-orm/pg-core` 导入 `integer` 与 `jsonb`（`mailIngestAccount` 已用 `integer`，其它表已用 `jsonb`）。若缺则补。

- [ ] **Step 6: 生成迁移 + 类型检查**

Run:

```bash
pnpm db:generate
pnpm --filter @arc/db-schema typecheck
```

Expected: 在 drizzle 迁移目录生成一个新迁移（`ALTER TABLE ... ADD COLUMN` + `CREATE INDEX`）；typecheck 通过。

- [ ] **Step 7: 提交**

```bash
git add packages/db-schema/src/schema.ts apps/ai-recruitment-copilot/drizzle
git commit -m "feat(db): mail_ingest 观测列（message 终态/JD绑定/附件数 + account 上轮计数）"
```

（迁移目录路径以 `pnpm db:generate` 实际输出为准；一并 `git add`。）

---

## Task 2: `deriveJdBindStatus` 纯函数

**Files:**

- Create: `apps/ai-recruitment-copilot-worker/src/mail-ingest/job-binding.ts`
- Test: `apps/ai-recruitment-copilot-worker/src/mail-ingest/job-binding.test.ts`

**Interfaces:**

- Consumes: `MailIngestJdBindStatus`（Task 1）。
- Produces: `function deriveJdBindStatus(input: { matchedJobIdCount: number; hasDefaultJd: boolean }): MailIngestJdBindStatus`

- [ ] **Step 1: 写失败测试**

创建 `job-binding.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { deriveJdBindStatus } from "./job-binding";

describe("deriveJdBindStatus", () => {
  it("exactly one matched code → bound", () => {
    expect(deriveJdBindStatus({ matchedJobIdCount: 1, hasDefaultJd: false })).toBe("bound");
    expect(deriveJdBindStatus({ matchedJobIdCount: 1, hasDefaultJd: true })).toBe("bound");
  });
  it("two or more matched → ambiguous", () => {
    expect(deriveJdBindStatus({ matchedJobIdCount: 2, hasDefaultJd: true })).toBe("ambiguous");
  });
  it("zero matched with default JD → fallback", () => {
    expect(deriveJdBindStatus({ matchedJobIdCount: 0, hasDefaultJd: true })).toBe("fallback");
  });
  it("zero matched without default JD → unmatched", () => {
    expect(deriveJdBindStatus({ matchedJobIdCount: 0, hasDefaultJd: false })).toBe("unmatched");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot-worker exec vitest run src/mail-ingest/job-binding.test.ts`
Expected: FAIL —「Cannot find module './job-binding'」。

- [ ] **Step 3: 实现**

创建 `job-binding.ts`：

```ts
import type { MailIngestJdBindStatus } from "@arc/db-schema/schema";

/**
 * 由现有 resolveMailJobBinding 已算出的中间值派生 jdBindStatus（仅观测，不改绑定动作）。
 */
export function deriveJdBindStatus(input: {
  matchedJobIdCount: number;
  hasDefaultJd: boolean;
}): MailIngestJdBindStatus {
  if (input.matchedJobIdCount === 1) {
    return "bound";
  }
  if (input.matchedJobIdCount >= 2) {
    return "ambiguous";
  }
  return input.hasDefaultJd ? "fallback" : "unmatched";
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @arc/ai-recruitment-copilot-worker exec vitest run src/mail-ingest/job-binding.test.ts`
Expected: PASS（4 用例）。

- [ ] **Step 5: 提交**

```bash
git add apps/ai-recruitment-copilot-worker/src/mail-ingest/job-binding.ts apps/ai-recruitment-copilot-worker/src/mail-ingest/job-binding.test.ts
git commit -m "feat(worker): deriveJdBindStatus 纯函数（JD 绑定观测派生）"
```

---

## Task 3: DAO 写入扩展（message 观测字段 / skip / 账号计数）

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/dao.ts`（`updateMailIngestMessageResult` ~947、`finishMailIngestAccountRun` ~829）
- Test: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/__tests__/dao.test.ts`

**Interfaces:**

- Consumes: 新列（Task 1）。
- Produces:
  - `updateMailIngestMessageResult(id, result)` 扩展 `result` 支持 `jdBindStatus?, boundJobDescriptionId?, extractedJobCodes?, attachmentCount?, resumeAttachmentCount?`
  - `markMailIngestMessageSkipped(id, skipReason, extra?)` — 写 `status=skipped`
  - `finishMailIngestAccountRun(accountId, opts)` 扩展支持 `counts?: { received, subjectSkipped, matched, queued, failed }`

- [ ] **Step 1: 写失败测试**（追加到 `dao.test.ts`，沿用文件顶部真实 `db` + 现有 org/user/account 夹具；参考文件已有的 `insert account` 帮助）

```ts
import {
  finishMailIngestAccountRun,
  markMailIngestMessageSkipped,
  updateMailIngestMessageResult,
  claimMailIngestMessageForProcessing,
} from "../dao";
import { mailIngestMessage } from "@arc/db-schema/schema";

describe("mail ingest observability writers", () => {
  it("updateMailIngestMessageResult persists observability fields", async () => {
    const accountId = await insertTestAccount(); // 复用文件中已有的建账号 helper（若名称不同，用其等价物）
    const claim = await claimMailIngestMessageForProcessing({
      accountId,
      fromAddress: null,
      mailbox: "INBOX",
      messageId: null,
      receivedAt: new Date(),
      subject: "s",
      uid: "1",
      uidValidity: "1",
    });
    await updateMailIngestMessageResult(claim.id, {
      status: "queued",
      batchId: null,
      jdBindStatus: "bound",
      boundJobDescriptionId: null,
      extractedJobCodes: ["AUR0001"],
      attachmentCount: 2,
      resumeAttachmentCount: 1,
    });
    const [row] = await db
      .select()
      .from(mailIngestMessage)
      .where(eq(mailIngestMessage.id, claim.id));
    expect(row.status).toBe("queued");
    expect(row.jdBindStatus).toBe("bound");
    expect(row.extractedJobCodes).toEqual(["AUR0001"]);
    expect(row.resumeAttachmentCount).toBe(1);
    expect(row.attachmentCount).toBe(2);
  });

  it("markMailIngestMessageSkipped writes skipped + reason", async () => {
    const accountId = await insertTestAccount();
    const claim = await claimMailIngestMessageForProcessing({
      accountId,
      fromAddress: null,
      mailbox: "INBOX",
      messageId: null,
      receivedAt: new Date(),
      subject: "s",
      uid: "2",
      uidValidity: "1",
    });
    await markMailIngestMessageSkipped(claim.id, "no_supported_attachment", {
      attachmentCount: 3,
      resumeAttachmentCount: 0,
    });
    const [row] = await db
      .select()
      .from(mailIngestMessage)
      .where(eq(mailIngestMessage.id, claim.id));
    expect(row.status).toBe("skipped");
    expect(row.skipReason).toBe("no_supported_attachment");
    expect(row.resumeAttachmentCount).toBe(0);
  });

  it("finishMailIngestAccountRun persists last-run counts", async () => {
    const accountId = await insertTestAccount();
    await finishMailIngestAccountRun(accountId, {
      counts: { received: 5, subjectSkipped: 2, matched: 3, queued: 2, failed: 1 },
    });
    const [row] = await db
      .select()
      .from(mailIngestAccount)
      .where(eq(mailIngestAccount.id, accountId));
    expect(row.lastRunReceived).toBe(5);
    expect(row.lastRunSubjectSkipped).toBe(2);
    expect(row.lastRunQueued).toBe(2);
  });
});
```

> 注：`insertTestAccount()` 用文件里已有的建账号方式（该测试文件已在 `beforeEach` 建 org/user 并有插 account 的写法）。若没有现成 helper，就内联一条 `db.insert(mailIngestAccount).values({...}).returning()`，字段照 schema 必填项填。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend exec vitest run src/server/routes/studio/routes/mail-ingest/__tests__/dao.test.ts`
Expected: FAIL —`markMailIngestMessageSkipped` 未导出 / `finishMailIngestAccountRun` 不接受 `counts` / 新字段未写入。

- [ ] **Step 3: 改 `updateMailIngestMessageResult`**（`dao.ts:947`）

```ts
export async function updateMailIngestMessageResult(
  id: string,
  result: {
    batchId?: string | null;
    error?: unknown;
    status: MailIngestMessageStatus;
    jdBindStatus?: MailIngestJdBindStatus | null;
    boundJobDescriptionId?: string | null;
    extractedJobCodes?: string[] | null;
    attachmentCount?: number | null;
    resumeAttachmentCount?: number | null;
  },
): Promise<void> {
  await db
    .update(mailIngestMessage)
    .set({
      batchId: result.batchId ?? null,
      errorMessage: result.error ? truncateError(result.error) : null,
      processedAt: new Date(),
      status: result.status,
      jdBindStatus: result.jdBindStatus ?? null,
      boundJobDescriptionId: result.boundJobDescriptionId ?? null,
      extractedJobCodes: result.extractedJobCodes ?? null,
      attachmentCount: result.attachmentCount ?? null,
      resumeAttachmentCount: result.resumeAttachmentCount ?? null,
    })
    .where(eq(mailIngestMessage.id, id));
}
```

在文件顶部 import 处补 `MailIngestJdBindStatus`、`MailIngestSkipReason`（来自 `@arc/db-schema/schema`）。

- [ ] **Step 4: 加 `markMailIngestMessageSkipped`**（`dao.ts`，紧邻上一函数）

```ts
export async function markMailIngestMessageSkipped(
  id: string,
  skipReason: MailIngestSkipReason,
  extra?: { attachmentCount?: number | null; resumeAttachmentCount?: number | null },
): Promise<void> {
  await db
    .update(mailIngestMessage)
    .set({
      processedAt: new Date(),
      status: "skipped",
      skipReason,
      attachmentCount: extra?.attachmentCount ?? null,
      resumeAttachmentCount: extra?.resumeAttachmentCount ?? null,
    })
    .where(eq(mailIngestMessage.id, id));
}
```

- [ ] **Step 5: 改 `finishMailIngestAccountRun`**（`dao.ts:829`）—— 兼容旧签名（error 可选）+ 新增 counts

```ts
export async function finishMailIngestAccountRun(
  accountId: string,
  opts?: {
    error?: unknown;
    counts?: {
      received: number;
      subjectSkipped: number;
      matched: number;
      queued: number;
      failed: number;
    };
  },
): Promise<void> {
  const now = new Date();
  await db
    .update(mailIngestAccount)
    .set({
      lastCheckedAt: now,
      lastError: opts?.error ? truncateError(opts.error) : null,
      pollingStartedAt: null,
      updatedAt: now,
      ...(opts?.counts
        ? {
            lastRunReceived: opts.counts.received,
            lastRunSubjectSkipped: opts.counts.subjectSkipped,
            lastRunMatched: opts.counts.matched,
            lastRunQueued: opts.counts.queued,
            lastRunFailed: opts.counts.failed,
          }
        : {}),
    })
    .where(eq(mailIngestAccount.id, accountId));
}
```

> ⚠️ 签名从 `(accountId, error?)` 变为 `(accountId, opts?)`。**Task 4 会更新 worker 里所有调用点**；本任务只改 DAO + 测试。

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend exec vitest run src/server/routes/studio/routes/mail-ingest/__tests__/dao.test.ts`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/dao.ts apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/__tests__/dao.test.ts
git commit -m "feat(mail-ingest): DAO 写入观测字段/skip/账号上轮计数"
```

---

## Task 4: Worker 采集点改造

**Files:**

- Modify: `apps/ai-recruitment-copilot-worker/src/mail-ingest/processor.ts`（`createBatchForMail` ~90、`resolveMailJobBinding` ~129、`processMailForAccount` ~159、`processAccountGroup` ~208、`runMailIngestOnce` ~276、`finishAccounts` ~272）
- Test: `apps/ai-recruitment-copilot-worker/src/mail-ingest/processor-run.test.ts`

**Interfaces:**

- Consumes: `deriveJdBindStatus`（Task 2）、扩展后的 DAO（Task 3）、`selectSupportedResumeAttachments`（现有）。
- Produces: worker 各路径写 message 观测字段 + skip + per-account 计数。

- [ ] **Step 1: 写失败测试**（在 `processor-run.test.ts` 追加用例，沿用文件已有的 `mocks` / `vi.hoisted` 结构：`updateMailIngestMessageResult`、`markMailIngestMessageSkipped`、`finishMailIngestAccountRun`、`fetchJobDescriptionsByCodes`、`insertBatchWithItems`/`loadBatchDetail`、`claimMailIngestMessageForProcessing` 等均已/需 mock）

```ts
it("queued mail records jdBindStatus + attachment counts", async () => {
  // 造一封 subject 命中关键词、含 1 个 pdf 附件、标题带唯一岗位码的邮件（用文件已有的 buildMail helper 或内联 ParsedMail）
  mocks.fetchJobDescriptionsByCodes.mockResolvedValue([{ code: "AUR0001", id: "jd-1" }]);
  // ...驱动 runMailIngestOnce...
  expect(mocks.updateMailIngestMessageResult).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      status: "queued",
      jdBindStatus: "bound",
      boundJobDescriptionId: "jd-1",
      resumeAttachmentCount: 1,
    }),
  );
});

it("mail with no supported attachment is skipped, not failed", async () => {
  // 造一封命中标题但附件全不支持（如 .zip）的邮件
  // ...驱动...
  expect(mocks.markMailIngestMessageSkipped).toHaveBeenCalledWith(
    expect.any(String),
    "no_supported_attachment",
    expect.objectContaining({ resumeAttachmentCount: 0 }),
  );
  expect(mocks.updateMailIngestMessageResult).not.toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ status: "failed" }),
  );
});

it("finishMailIngestAccountRun receives per-account counts", async () => {
  // 造 2 封：一封 subject 不符、一封 queued
  // ...驱动...
  expect(mocks.finishMailIngestAccountRun).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      counts: expect.objectContaining({ received: 2, subjectSkipped: 1, queued: 1 }),
    }),
  );
});
```

> 用文件里已有的邮件构造/驱动方式（`processor-run.test.ts` 顶部已 mock imapflow 的 `search`/`fetchOne` 与 `simpleParser`）。附件用 `mail.attachments`，`selectSupportedResumeAttachments` 是真实纯函数（按 contentType/filename 过滤）。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot-worker exec vitest run src/mail-ingest/processor-run.test.ts`
Expected: FAIL（`markMailIngestMessageSkipped` 未被调用；jdBindStatus 未传）。

- [ ] **Step 3: `resolveMailJobBinding` 返回观测数据**

```ts
interface MailJobBindingResult {
  binding: MailJobBinding;
  observability: {
    jdBindStatus: MailIngestJdBindStatus;
    extractedJobCodes: string[];
    boundJobDescriptionId: string | null;
  };
}

async function resolveMailJobBinding(
  account: WorkerMailIngestAccount,
  subject: string | null,
): Promise<MailJobBindingResult> {
  const hasDefaultJd = Boolean(account.jobDescriptionId);
  const defaultBinding = { jdMode: account.jdMode, jobDescriptionId: account.jobDescriptionId };
  const codes = extractJobCodesFromSubject(subject); // 已归一化（大写去重）
  const jobs = codes.length ? await fetchJobDescriptionsByCodes(account.organizationId, codes) : [];
  const matchedJobIds = new Set(jobs.map((job) => job.id));
  const jdBindStatus = deriveJdBindStatus({ matchedJobIdCount: matchedJobIds.size, hasDefaultJd });

  if (matchedJobIds.size !== 1) {
    if (matchedJobIds.size > 1) {
      console.warn("[mail-ingest] multiple subject job codes matched different jobs", {
        accountId: account.id,
        codes,
        jobIds: [...matchedJobIds],
      });
    }
    return {
      binding: defaultBinding,
      observability: {
        jdBindStatus,
        extractedJobCodes: codes,
        boundJobDescriptionId: defaultBinding.jobDescriptionId,
      },
    };
  }
  const boundId = [...matchedJobIds][0] ?? null;
  return {
    binding: { jdMode: "bind", jobDescriptionId: boundId },
    observability: { jdBindStatus, extractedJobCodes: codes, boundJobDescriptionId: boundId },
  };
}
```

import 顶部加 `deriveJdBindStatus`（`./job-binding`）与 `MailIngestJdBindStatus`（`@arc/db-schema/schema`）。

- [ ] **Step 4: `createBatchForMail` 无附件返回 null（不抛）**

```ts
async function createBatchForMail(
  account: WorkerMailIngestAccount,
  mail: ParsedMail,
  binding: MailJobBinding,
): Promise<{ batchId: string; jobs: {...}[]; resumeAttachmentCount: number } | null> {
  const attachments = selectSupportedResumeAttachments(mail.attachments);
  if (attachments.length === 0) {
    return null; // 无受支持附件 → 交给上层标 skipped
  }
  const files = await Promise.all(attachments.map(storeResumeAttachment));
  const batchId = await insertBatchWithItems({ /* 原参数不变 */ });
  const detail = await loadBatchDetail(batchId, account.organizationId, account.userId);
  if (!detail) {
    throw new Error("邮件简历批次创建失败。");
  }
  return {
    batchId,
    jobs: detail.items.map((item) => ({ batchId, itemId: item.id, organizationId: account.organizationId, userId: account.userId })),
    resumeAttachmentCount: attachments.length,
  };
}
```

- [ ] **Step 5: `processMailForAccount` 写观测 + skip + 计数**（返回值加计数字段）

```ts
type MailAccountTally = {
  received: number;
  subjectSkipped: number;
  queued: number;
  failed: number;
  noAttachment: number;
};

async function processMailForAccount(
  account,
  mail,
  message,
  uid,
  uidValidity,
): Promise<MailAccountTally> {
  const tally = { received: 1, subjectSkipped: 0, queued: 0, failed: 0, noAttachment: 0 };
  const subject = normalizeSubject(mail.subject) ?? normalizeSubject(message.envelope?.subject);
  if (!isMatchingResumeMailSubject(subject ?? undefined, account.subjectKeyword)) {
    tally.subjectSkipped = 1;
    return tally; // 标题不符：不建行，仅计数（listenStart 前旧邮件同样只计数，见下）
  }
  const receivedAt = mail.date ?? toDate(message.internalDate);
  if (!shouldProcessMailByListenStart(receivedAt, account.listenStartAt)) {
    return tally; // listenStart 前旧邮件：received 已计，不建行、不入 subjectSkipped
  }
  const messageClaim = await claimMailIngestMessageForProcessing({
    /* 原参数不变 */
  });
  if (!messageClaim.shouldProcess) {
    return tally; // 重复命中现有终态行：no-op
  }
  const attachmentCount = mail.attachments?.length ?? 0;
  try {
    const { binding, observability } = await resolveMailJobBinding(account, subject);
    const batch = await createBatchForMail(account, mail, binding);
    if (!batch) {
      await markMailIngestMessageSkipped(messageClaim.id, "no_supported_attachment", {
        attachmentCount,
        resumeAttachmentCount: 0,
      });
      tally.noAttachment = 1;
      return tally;
    }
    await updateMailIngestMessageResult(messageClaim.id, {
      batchId: batch.batchId,
      status: "queued",
      jdBindStatus: observability.jdBindStatus,
      boundJobDescriptionId: observability.boundJobDescriptionId,
      extractedJobCodes: observability.extractedJobCodes,
      attachmentCount,
      resumeAttachmentCount: batch.resumeAttachmentCount,
    });
    await enqueueResumeParseJobs(batch.jobs);
    tally.queued = 1;
  } catch (error) {
    await updateMailIngestMessageResult(messageClaim.id, {
      error,
      status: "failed",
      attachmentCount,
    });
    tally.failed = 1;
  }
  return tally;
}
```

- [ ] **Step 6: `processAccountGroup` 按账号累计 tally**（返回 `Map<accountId, MailAccountTally>`）

把内层 `for (const account of accounts)` 里对每封邮件的 tally 按 `account.id` 累加进一个 `Map<string, MailAccountTally>`，函数返回该 map（连同原有 group 级 RunResult 计数可保留用于日志）。空邮件/无 uid 时给每个账号返回零 tally。

- [ ] **Step 7: `finishAccounts` / `runMailIngestOnce` 写 counts**

```ts
async function finishAccounts(accounts, tallies: Map<string, MailAccountTally>, error?: unknown) {
  await Promise.all(
    accounts.map(({ id }) => {
      const t = tallies.get(id) ?? {
        received: 0,
        subjectSkipped: 0,
        queued: 0,
        failed: 0,
        noAttachment: 0,
      };
      return finishMailIngestAccountRun(id, {
        error,
        counts: {
          received: t.received,
          subjectSkipped: t.subjectSkipped,
          matched: t.queued + t.failed + t.noAttachment,
          queued: t.queued,
          failed: t.failed,
        },
      });
    }),
  );
}
```

`runMailIngestOnce` 里把 `processAccountGroup` 返回的 tally map 传给 `finishAccounts(group.accounts, tallies)`；catch 分支传 `finishAccounts(group.accounts, new Map(), error)`。**守恒**：`received = subjectSkipped + listenStart前 + 重复no-op + matched`，`matched = queued + noAttachment + failed`。

- [ ] **Step 8: 跑测试确认通过 + worker 全量**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot-worker exec vitest run src/mail-ingest/processor-run.test.ts
pnpm --filter @arc/ai-recruitment-copilot-worker test
```

Expected: 新用例 + 存量用例全绿（注意存量用例可能断言旧 `finishMailIngestAccountRun(id, error)` 签名 —— 若失败，按新 `opts` 签名更新存量断言）。

- [ ] **Step 9: 提交**

```bash
git add apps/ai-recruitment-copilot-worker/src/mail-ingest/processor.ts apps/ai-recruitment-copilot-worker/src/mail-ingest/processor-run.test.ts
git commit -m "feat(worker): 采集观测字段、无附件转 skipped、per-account 上轮计数"
```

---

## Task 5: 信件日志查询 DAO（两步分页 + 下游 JOIN + 作用域）

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/dao.ts`
- Test: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/__tests__/dao.test.ts`

**Interfaces:**

- Produces:
  - `listAccountMailMessages(input: { organizationId; accountId; page; pageSize; status?; skipReason?; jdBindStatus?; keyword?; receivedFrom?; receivedTo? }): Promise<{ records: MailMessageLogRecord[]; total: number }>`
  - `MailMessageLogRecord = { id; receivedAt; fromAddress; subject; status; skipReason; jdBindStatus; boundJobDescriptionName; attachmentCount; resumeAttachmentCount; poolSummary: "all_pooled"|"partial_failed"|"all_failed"|"parsing"|null; attachments: { poolItemId; fileName; resumeParseStatus; resumeParseError; hasDuplicate; resumeRecordId }[] }`

- [ ] **Step 1: 写失败测试**（`dao.test.ts` 追加；建 1 个账号 + 3 条 message：queued 带 batch(2 附件，一 ready 一 failed) / skipped(no_attachment, batchId null) / failed；断言两步分页正确、batchId=null 行 attachments 为空、poolSummary=partial_failed、跨 org 不可见、排序 NULLS LAST）

```ts
it("listAccountMailMessages returns per-message rows with attachment expansion + scope", async () => {
  const accountId = await insertTestAccount();
  // 造数据：见上（用 db.insert 直接写 mailIngestMessage / resume_upload_batch / batch_item / resume_pool_item）
  const res = await listAccountMailMessages({
    organizationId: ORG,
    accountId,
    page: 1,
    pageSize: 20,
  });
  expect(res.total).toBe(3);
  const skipped = res.records.find((r) => r.status === "skipped");
  expect(skipped?.attachments).toEqual([]);
  const queued = res.records.find((r) => r.status === "queued");
  expect(queued?.attachments).toHaveLength(2);
  expect(queued?.poolSummary).toBe("partial_failed");
  // 跨 org 不可见
  const other = await listAccountMailMessages({
    organizationId: OTHER_ORG,
    accountId,
    page: 1,
    pageSize: 20,
  });
  expect(other.total).toBe(0);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend exec vitest run src/server/routes/studio/routes/mail-ingest/__tests__/dao.test.ts -t listAccountMailMessages`
Expected: FAIL —`listAccountMailMessages` 未定义。

- [ ] **Step 3: 实现 `listAccountMailMessages`（两步）**

```ts
export interface MailMessageLogRecord {
  /* 见 Interfaces */
}

export async function listAccountMailMessages(input: {
  organizationId: string;
  accountId: string;
  page: number;
  pageSize: number;
  status?: MailIngestMessageStatus;
  skipReason?: MailIngestSkipReason;
  jdBindStatus?: MailIngestJdBindStatus;
  keyword?: string;
  receivedFrom?: Date;
  receivedTo?: Date;
}): Promise<{ records: MailMessageLogRecord[]; total: number }> {
  // 第一步：先确认账号属于该 org（作用域），再对 message 分页
  const where = and(
    eq(mailIngestMessage.accountId, input.accountId),
    // 账号 org 作用域：JOIN account 或子查询限定 account.organizationId = input.organizationId
    ...(input.status ? [eq(mailIngestMessage.status, input.status)] : []),
    ...(input.skipReason ? [eq(mailIngestMessage.skipReason, input.skipReason)] : []),
    ...(input.jdBindStatus ? [eq(mailIngestMessage.jdBindStatus, input.jdBindStatus)] : []),
    ...(input.keyword
      ? [
          or(
            ilike(mailIngestMessage.subject, `%${input.keyword}%`),
            ilike(mailIngestMessage.fromAddress, `%${input.keyword}%`),
          ),
        ]
      : []),
    ...(input.receivedFrom ? [gte(mailIngestMessage.receivedAt, input.receivedFrom)] : []),
    ...(input.receivedTo ? [lte(mailIngestMessage.receivedAt, input.receivedTo)] : []),
  );
  // account org 作用域用 innerJoin(mailIngestAccount) + eq(account.organizationId, input.organizationId)
  const base = db
    .select({
      /* message 列 + account.organizationId */
    })
    .from(mailIngestMessage)
    .innerJoin(
      mailIngestAccount,
      and(
        eq(mailIngestMessage.accountId, mailIngestAccount.id),
        eq(mailIngestAccount.organizationId, input.organizationId),
      ),
    )
    .where(where);

  const [{ count: total }] = await db
    .select({ count: count() })
    .from(/* 同 base 的 from+join+where */);
  const rows = await base
    .orderBy(sql`${mailIngestMessage.receivedAt} DESC NULLS LAST`, desc(mailIngestMessage.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);

  // 第二步：按本页非空 batchId 批量取 batch item → pool item（+ 岗位名 + 疑似重复布尔）
  const batchIds = rows.map((r) => r.batchId).filter((v): v is string => Boolean(v));
  const attachmentsByBatch = batchIds.length
    ? await loadMailMessageAttachments(input.organizationId, batchIds)
    : new Map();

  const records = rows.map((r) => {
    const attachments = attachmentsByBatch.get(r.batchId ?? "") ?? [];
    return {
      /* 映射 + poolSummary = summarizePool(attachments) */
    };
  });
  return { records, total };
}
```

同文件加两个辅助：

- `loadMailMessageAttachments(organizationId, batchIds)`：`resume_upload_batch_item` JOIN `resume_pool_item`（`resumeParseStatus/resumeParseError/id`，且 `resume_pool_item.organizationId = organizationId`），并按 pool item 是否存在 duplicate-match 行给 `hasDuplicate` 布尔；返回 `Map<batchId, attachment[]>`。
- `summarizePool(attachments)`：全 `ready`→`all_pooled`；全 `failed`→`all_failed`；混合含 failed→`partial_failed`；含 `processing/queued`→`parsing`；空→`null`。

（`count/desc/ilike/gte/lte/or/and/sql` 从 `drizzle-orm` 导入，文件多数已在用。）

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend exec vitest run src/server/routes/studio/routes/mail-ingest/__tests__/dao.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/dao.ts apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/__tests__/dao.test.ts
git commit -m "feat(mail-ingest): listAccountMailMessages 两步分页 + 附件级下游 + 作用域"
```

---

## Task 6: messages 端点（工作区 + 平台）

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/schema.ts`（加查询参数 zod）
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/route.ts`（加 `GET /:id/messages`）
- Modify: `apps/ai-recruitment-copilot/src/lib/start/platform/mail-ingest-accounts.functions.ts`（平台端 server function 调 `listAccountMailMessages`）
- Test: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/__tests__/route.test.ts`

**Interfaces:**

- Consumes: `listAccountMailMessages`（Task 5）。
- Produces: `GET /w/:slug/studio/mail-ingest-accounts/:id/messages`（自助）+ 平台 server function。

- [ ] **Step 1: 加查询 schema**（`schema.ts`）

```ts
export const listMailMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["processing", "queued", "skipped", "failed"]).optional(),
  skipReason: z.enum(["no_supported_attachment"]).optional(),
  jdBindStatus: z.enum(["bound", "unmatched", "ambiguous", "fallback"]).optional(),
  keyword: z.string().trim().min(1).optional(),
  receivedFrom: z.coerce.date().optional(),
  receivedTo: z.coerce.date().optional(),
});
```

- [ ] **Step 2: 写失败测试**（`route.test.ts`）：自助端能查到自己账号的信件；跨用户/跨 org 得空或 403（沿用文件现有的 testClient/鉴权夹具）。

- [ ] **Step 3: 加自助路由**（`route.ts` 的自助 sub-router 里，`requirePermission("mailIngestAccount", "read")`）

```ts
.get(
  "/:id/messages",
  requirePermission("mailIngestAccount", "read"),
  zValidator("query", listMailMessagesQuerySchema, jsonValidatorError("查询参数不合法")),
  async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg) return c.json({ message: "Unauthorized" }, 401);
    const accountId = c.req.param("id");
    // 自助作用域：确认该账号 createdBy = 当前 user（复用现有账号可见性判断）；否则 404
    const q = c.req.valid("query");
    const result = await listAccountMailMessages({ organizationId: activeOrg.id, accountId, ...q });
    return c.json(result, 200);
  },
)
```

> 自助作用域：沿用文件里现有「读取自己账号」的判定（现有 `GET /` 已按 `createdBy` 过滤，复用其判定函数确认 `accountId` 归属当前 user；不归属返回 404）。平台端（`/managed` 侧）不加 `createdBy` 限制。

- [ ] **Step 4: 平台端 server function**（`mail-ingest-accounts.functions.ts`）加一个调用 `listAccountMailMessages`（org 级、无 `createdBy` 限制，需 `manage` 权限）的函数，供平台页用。

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend exec vitest run src/server/routes/studio/routes/mail-ingest/__tests__/route.test.ts`
Expected: PASS。

- [ ] **Step 6: 类型检查 + 提交**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend typecheck`

```bash
git add apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/schema.ts apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/route.ts apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/mail-ingest/__tests__/route.test.ts apps/ai-recruitment-copilot/src/lib/start/platform/mail-ingest-accounts.functions.ts
git commit -m "feat(mail-ingest): 信件日志查询端点（工作区自助 + 平台）"
```

---

## Task 7: 联调收尾（迁移 + 全量 + 格式化）

**Files:** 无新增，收尾。

- [ ] **Step 1: 迁移落库（本地）**

Run: `pnpm db:migrate`
Expected: Task 1 的迁移应用成功。

- [ ] **Step 2: 全量测试 + 类型检查 + 格式化**

Run:

```bash
pnpm fix
pnpm --filter @arc/db-schema typecheck
pnpm --filter @arc/ai-recruitment-copilot-worker test
pnpm --filter @arc/ai-recruitment-copilot-backend exec vitest run src/server/routes/studio/routes/mail-ingest
```

Expected: 全绿；`pnpm fix` 无遗留改动未提交。

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "chore(mail-ingest): 观测后端联调收尾（迁移/格式化）"
```

---

## Self-Review

**Spec 覆盖：**

- 数据模型加列（skipReason/jdBindStatus/boundJobDescriptionId/extractedJobCodes/attachment 双计数）→ Task 1。✅
- 枚举 `text().$type<>()` 无 DB check → Task 1。✅
- `receivedAt desc` 索引 → Task 1。✅
- 账号上轮计数 5 列 → Task 1 + Task 3 + Task 4（守恒式）。✅
- jdBindStatus 仅观测、由现有绑定派生 → Task 2 + Task 4（`resolveMailJobBinding` 只加返回、不改动作）。✅
- 无附件 → skipped（非 failed）→ Task 4（`createBatchForMail` 返回 null）。✅
- 复合唯一键只建一次 + 重复 no-op → 沿用现有 `claimMailIngestMessageForProcessing`（Task 4 不改其幂等）。✅
- 两步分页 + batchId 容空 + 附件级展开 + poolSummary + NULLS LAST 排序 + org 作用域落各表 → Task 5。✅
- 工作区 + 平台两个端点 + 权限作用域 → Task 6。✅
- 中断幂等缺口本期不修（只暴露）→ 不在计划范围（spec 已声明），无对应任务，符合预期。✅
- 前端日志 UI → **Plan B（后续）**，本计划不含（已在开头声明拆分）。✅

**Placeholder 扫描：** 无 TBD/TODO。Task 5/6 的部分 DAO/route 用「结构 + 关键片段」描述而非逐字（因需沿用文件现有 import/夹具/鉴权判定），已标注复用点；实现者按现有模式补全。Task 3 的 `insertTestAccount` 显式说明复用现有夹具或内联 insert。

**类型一致性：** `MailIngestJdBindStatus`/`MailIngestSkipReason`（Task 1）贯穿 Task 2/3/4/5/6；`deriveJdBindStatus` 签名（Task 2）= Task 4 调用；`finishMailIngestAccountRun(accountId, opts)` 新签名（Task 3）= Task 4 调用；`listAccountMailMessages` 签名（Task 5）= Task 6 调用。一致。✅

**范围：** 单一子系统（邮件入库观测后端），可独立测试交付（API 返回可查询的观测数据）。前端 UI 拆为 Plan B。
