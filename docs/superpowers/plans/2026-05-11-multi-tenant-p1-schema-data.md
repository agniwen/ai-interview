# 多租户改造 P1 — Schema + 数据基础 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给所有业务表加 `organizationId` 列（nullable），建立默认 workspace `org_default` + 把全部现有用户加为 member，把全部历史业务数据 backfill 到 `org_default`，给 user 表加 `feishuTenantKey` / `feishuTenantName`（保留旧列暂不删）。完成本计划后，应用对外行为**完全不变**（DAO 仍未按 org 过滤）；P2 会接管路由 + DAO scoping 后再 ALTER NOT NULL。

**Architecture:** 严格遵守 spec §4.3 的列表加 organizationId（17 张业务表 + global_config + user 重命名）。所有 schema 改动走 `src/lib/shared/db/schema.ts`；关系挂到 `relations.ts`。drizzle-kit 生成纯 schema diff 的 SQL，data backfill 手动追加到同一个 migration 文件尾部。**所有 organization-相关概念（organization / member / invitation 表）继续用 Better Auth 官方 `organization` 插件提供的实体——本计划不引入任何自建多租户实体**。

**Tech Stack:** Drizzle ORM 1.0-rc, PostgreSQL, Better Auth `organization` plugin (已在 P0 接好).

**Spec reference:** `docs/superpowers/specs/2026-05-11-multi-tenant-design.md` §4.2 (user 改名)、§4.3 (业务表加 orgId)、§4.4 (global_config per-org)、§5 (数据迁移脚本)。

**Branch:** 继续在 `feat/multi-tenant-p0-foundation`，**不新建分支**（用户明确要求）。

---

## Out of Scope（本计划不做）

- **DAO 加 orgId 参数**：DAOs 暂仍读所有 org 的数据（行为不变）。P2 接管。
- **`ALTER COLUMN organization_id SET NOT NULL`**：在 DAO scoping 之前 ALTER NOT NULL 会让 INSERT 失败。P2 末尾再做。
- **删除 user 表的 organizationId / organizationName 旧列**：保留以保后向兼容。P3/P4 清理。
- **`/w/[slug]/...` 路由 / UI / 邀请页**：P2 范围。
- **权限矩阵 / better-auth admin gate 改造**：P0 已就位 statement+roles；P2 才接 hono middleware。

---

## 文件结构

**Modify:**

- `src/lib/shared/db/schema.ts` — 给 17 张业务表加 `organizationId text` 列 + 索引；给 `user` 加 `feishuTenantKey` / `feishuTenantName`；给 `globalConfig` 加 `organizationId text` 列
- `src/lib/shared/db/relations.ts` — `organization` 增加反向 many 关系到 17 张业务表
- `src/lib/server/auth.ts` — `user.additionalFields` 追加 `feishuTenantKey` / `feishuTenantName`

**Auto-generated:**

- `drizzle/<timestamp>_<name>/migration.sql` — drizzle-kit 生成 schema diff；本计划在尾部手动追加 data backfill SQL

---

## 业务表清单（必须照此清单实施）

**Tier A — 一级实体（9 张）：**

1. `studio_interview`
2. `department`
3. `interviewer`
4. `job_description`
5. `candidate_form_template`
6. `interview_question_template`
7. `chat_conversation`
8. `chat_attachment`
9. `feishu_thread_state`

**Tier B — 热写子表（8 张）：** 10. `interview_conversation` 11. `interview_conversation_turn` 12. `interview_audit_log` 13. `interview_notification` 14. `studio_interview_schedule` 15. `candidate_form_submission` 16. `interview_question_template_binding` 17. `chat_message`

**派生不打戳的表（不动）：**

- `candidate_form_template_question` / `_version`
- `interview_question_template_question` / `_version`
- `candidate_form_template_job_description` (M:N)
- `interview_question_template_job_description` (M:N)
- `job_description_interviewer` (M:N)

---

## Task 1 — Tier A 业务表加 organizationId 列 + 索引（schema.ts）

**Files:**

- Modify: `src/lib/shared/db/schema.ts`

**Pattern**：在每张表的 `pgTable("<name>", { ...fields, organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }) }, (table) => [..., index("<name>_organization_idx").on(table.organizationId)])` 加列 + 索引。**不要**加 `.notNull()`——P2 才 ALTER NOT NULL。

- [ ] **Step 1: 给 `studio_interview` 加 organizationId + 索引**

打开 `src/lib/shared/db/schema.ts`，定位到 `export const studioInterview = pgTable(...)`。在 `fields` 对象里追加（oxfmt 会按字母序排序，放哪都行）：

```ts
organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
```

在 indexes 数组里追加：

```ts
index("studio_interview_organization_idx").on(table.organizationId),
```

- [ ] **Step 2: 同样地处理另外 8 张 Tier A 表**

依次对 `department`, `interviewer`, `jobDescription`, `candidateFormTemplate`, `interviewQuestionTemplate`, `chatConversation`, `chatAttachment`, `feishuThreadState` 重复 Step 1 的两个改动。**索引命名**：`<table_snake>_organization_idx`，对应：

- `department_organization_idx`
- `interviewer_organization_idx`
- `job_description_organization_idx`
- `candidate_form_template_organization_idx`
- `interview_question_template_organization_idx`
- `chat_conversation_organization_idx`
- `chat_attachment_organization_idx`
- `feishu_thread_state_organization_idx`

`feishuThreadState` 当前没有 indexes 数组（只有 fields），需要把 `pgTable("feishu_thread_state", {...})` 改为带 `(table) => [...]` 的三参形式：

```ts
export const feishuThreadState = pgTable(
  "feishu_thread_state",
  {
    activeJdId: text("active_jd_id").references(() => jobDescription.id, {
      onDelete: "set null",
    }),
    activeJdSetAt: timestamp("active_jd_set_at"),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    threadId: text("thread_id").primaryKey(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("feishu_thread_state_organization_idx").on(table.organizationId)],
);
```

注意：原文件有 `/* @__PURE__ */ new Date()` 的 bundler hint 注释，保留它（don't strip）。

- [ ] **Step 3: typecheck**

Run:

```
pnpm typecheck
```

Expected: PASS — 9 张表新增字段引用 `organization.id` 类型正确。

- [ ] **Step 4: Commit**

```
git add src/lib/shared/db/schema.ts
git commit -m "feat(db): add organizationId to Tier A business tables (nullable)"
```

---

## Task 2 — Tier B 热写子表加 organizationId + 索引

**Files:**

- Modify: `src/lib/shared/db/schema.ts`

- [ ] **Step 1: 依次给 8 张 Tier B 表追加 organizationId + 索引**

对以下 8 张表，沿用 Task 1 的 pattern（fields 加列 + indexes 数组加索引）：

| 表名（drizzle export）             | 索引名                                                 |
| ---------------------------------- | ------------------------------------------------------ |
| `interviewConversation`            | `interview_conversation_organization_idx`              |
| `interviewConversationTurn`        | `interview_conversation_turn_organization_idx`         |
| `interviewAuditLog`                | `interview_audit_log_organization_idx`                 |
| `interviewNotification`            | `interview_notification_organization_idx`              |
| `studioInterviewSchedule`          | `studio_interview_schedule_organization_idx`           |
| `candidateFormSubmission`          | `candidate_form_submission_organization_idx`           |
| `interviewQuestionTemplateBinding` | `interview_question_template_binding_organization_idx` |
| `chatMessage`                      | `chat_message_organization_idx`                        |

字段写法（每个表都一样，**保持不 notNull**）：

```ts
organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
```

索引写法：

```ts
index("<idx_name>").on(table.organizationId),
```

- [ ] **Step 2: typecheck**

Run:

```
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```
git add src/lib/shared/db/schema.ts
git commit -m "feat(db): add organizationId to Tier B hot-write child tables (nullable)"
```

---

## Task 3 — user 表加 feishuTenantKey / feishuTenantName 列

**Files:**

- Modify: `src/lib/shared/db/schema.ts`
- Modify: `src/lib/server/auth.ts`

**注意**：旧列 `organizationId` / `organizationName` **保留**，P3/P4 才 drop。

- [ ] **Step 1: 在 user 表追加两个新字段**

打开 `src/lib/shared/db/schema.ts`，定位 `export const user = pgTable("user", {...})`。在对象里追加（oxfmt 会按字母序排序）：

```ts
feishuTenantKey: text("feishu_tenant_key"),
feishuTenantName: text("feishu_tenant_name"),
```

保留 `organizationId: text("organization_id")` 和 `organizationName: text("organization_name")` 不动。

- [ ] **Step 2: 在 auth.ts 的 user.additionalFields 追加新字段声明**

打开 `src/lib/server/auth.ts`，定位 `user: { additionalFields: { organizationId: {...}, organizationName: {...} } }`。在该 object 里追加：

```ts
feishuTenantKey: {
  input: false,
  required: false,
  type: "string",
},
feishuTenantName: {
  input: false,
  required: false,
  type: "string",
},
```

保留 `organizationId` / `organizationName` 不动。

最终 `user.additionalFields` 应有 4 个字段（两旧两新）。

- [ ] **Step 3: typecheck**

Run:

```
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```
git add src/lib/shared/db/schema.ts src/lib/server/auth.ts
git commit -m "feat(auth): add feishuTenantKey/Name to user (rename of legacy organizationId/Name)"
```

---

## Task 4 — global_config 加 organizationId 列

**Files:**

- Modify: `src/lib/shared/db/schema.ts`

**注意**：保留 `id text PK default "singleton"` 不动；新加的 `organizationId` 列**不是 PK**。P4 cleanup 时才会把 PK 换过去 + drop id 列。

- [ ] **Step 1: 在 globalConfig 加 organizationId 列**

定位 `export const globalConfig = pgTable("global_config", {...})`。追加：

```ts
organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
```

保留 `id: text("id").primaryKey().default("singleton")` 不动。

- [ ] **Step 2: typecheck**

Run:

```
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```
git add src/lib/shared/db/schema.ts
git commit -m "feat(db): add organizationId to global_config (singleton → per-org transition)"
```

---

## Task 5 — relations.ts 补反向关系

**Files:**

- Modify: `src/lib/shared/db/relations.ts`

- [ ] **Step 1: 在 `organization` 块加 many 关系**

定位 `organization: { invitations: r.many.invitation(), members: r.many.member() }`。在该对象内追加 17 个 many 关系（按字母序）：

```ts
organization: {
  candidateFormSubmissions: r.many.candidateFormSubmission(),
  candidateFormTemplates: r.many.candidateFormTemplate(),
  chatAttachments: r.many.chatAttachment(),
  chatConversations: r.many.chatConversation(),
  chatMessages: r.many.chatMessage(),
  departments: r.many.department(),
  feishuThreadStates: r.many.feishuThreadState(),
  globalConfigs: r.many.globalConfig(),
  interviewAuditLogs: r.many.interviewAuditLog(),
  interviewConversationTurns: r.many.interviewConversationTurn(),
  interviewConversations: r.many.interviewConversation(),
  interviewNotifications: r.many.interviewNotification(),
  interviewQuestionTemplateBindings: r.many.interviewQuestionTemplateBinding(),
  interviewQuestionTemplates: r.many.interviewQuestionTemplate(),
  interviewers: r.many.interviewer(),
  invitations: r.many.invitation(),
  jobDescriptions: r.many.jobDescription(),
  members: r.many.member(),
  studioInterviewSchedules: r.many.studioInterviewSchedule(),
  studioInterviews: r.many.studioInterview(),
},
```

- [ ] **Step 2: 在每张业务表的 relations 块加 `organization: r.one.organization(...)`**

对以下 17 张表，定位它们在 relations.ts 中的 relations 块（按字母序找），在块内追加一行：

```ts
organization: r.one.organization({
  from: r.<tableExport>.organizationId,
  to: r.organization.id,
}),
```

具体 17 张表的 export name + relations 块名一致：`studioInterview`, `department`, `interviewer`, `jobDescription`, `candidateFormTemplate`, `interviewQuestionTemplate`, `chatConversation`, `chatAttachment`, `feishuThreadState`, `interviewConversation`, `interviewConversationTurn`, `interviewAuditLog`, `interviewNotification`, `studioInterviewSchedule`, `candidateFormSubmission`, `interviewQuestionTemplateBinding`, `chatMessage`.

如果某张业务表在 `relations.ts` 中**没有**对应的 relations 块（即过去没有任何关系定义），新建块：

```ts
<tableExport>: {
  organization: r.one.organization({
    from: r.<tableExport>.organizationId,
    to: r.organization.id,
  }),
},
```

**Sanity check**：编辑完后，drizzle 不会因为这一步报错——如果 typecheck 报 "Property 'organizationId' does not exist on type X"，说明上游 Task 1/2 有遗漏，回去补上。

- [ ] **Step 3: 同样地为 globalConfig 加 relations**

```ts
globalConfig: {
  organization: r.one.organization({
    from: r.globalConfig.organizationId,
    to: r.organization.id,
  }),
  // 如果原本已有 user 字段则保留:
  // user: r.one.user({ from: r.globalConfig.updatedBy, to: r.user.id }),
},
```

如果原本 `globalConfig` 块已有 `user` 子关系（指向 `updatedBy`），保留它，只追加 `organization`。

- [ ] **Step 4: typecheck**

Run:

```
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add src/lib/shared/db/relations.ts
git commit -m "feat(db): wire organization back-references to all tenant-scoped tables"
```

---

## Task 6 — drizzle 生成 schema diff migration

**Files:**

- Auto-generated: `drizzle/<timestamp>_<name>/migration.sql`

- [ ] **Step 1: 让 drizzle-kit 算 diff**

Run:

```
pnpm db:generate
```

Expected: 在 `drizzle/` 下生成一个新的 `<timestamp>_<name>/migration.sql` 目录 + 文件，内含：

- 17 条 `ALTER TABLE ... ADD COLUMN "organization_id" text` 语句
- 17 条对应的 `ALTER TABLE ... ADD CONSTRAINT FK references organization(id) ON DELETE CASCADE`
- 17 条 `CREATE INDEX "..._organization_idx" ON ...` 语句
- 2 条 `ALTER TABLE "user" ADD COLUMN "feishu_tenant_key" text` / `feishu_tenant_name`
- 1 条 `ALTER TABLE "global_config" ADD COLUMN "organization_id" text` + FK

- [ ] **Step 2: 人工 review SQL**

打开新生成的 `migration.sql` 文件确认：

1. **零** DROP / RENAME / TYPE 修改语句
2. **零** ALTER ... NOT NULL（必须保持 nullable）
3. FK constraint 全部 `ON DELETE CASCADE`
4. 索引名与 schema.ts 一致

如果出现意外 DROP，**停下来**——上游 Task 1-5 有手抖。

- [ ] **Step 3: Commit 这一段 schema-only migration**

```
git add drizzle/
git commit -m "feat(db): generate migration to add organizationId across tenant-scoped tables"
```

---

## Task 7 — 在同一 migration 末尾追加 data backfill SQL

**Files:**

- Modify: `drizzle/<the-just-generated-folder>/migration.sql`

drizzle 不支持原生 data migration；但 migration 文件本质就是顺序执行的 SQL，所以**手动在文件末尾追加** backfill 语句。

- [ ] **Step 1: 找到新生成的 migration 文件**

Run:

```
ls -1t drizzle/ | head -3
```

找到最新的 `<timestamp>_<name>` 目录，记下完整路径。

- [ ] **Step 2: 在该 migration.sql 文件末尾追加 backfill**

把下面整段 **追加** 到 `migration.sql` 文件末尾（不要删除前面 drizzle-kit 已生成的 DDL）：

```sql

-- ============================================================
-- DATA BACKFILL (multi-tenant P1) — runs as part of migration
-- ============================================================

-- 7.1 创建默认 workspace
INSERT INTO "organization" ("id", "name", "slug", "created_at")
VALUES ('org_default', '默认工作区', 'default', NOW())
ON CONFLICT ("id") DO NOTHING;

-- 7.2 把所有现有用户加为成员
--   • 老 ADMIN_ORGANIZATION_ID 列表里的 feishu tenant_key  → admin
--   • better-auth user.role='admin'                           → admin
--   • 其他人                                                  → hr (不中断业务)
-- ADMIN_ORG_IDS 在生产部署时由 op 用 psql 替换为真实 tenant_key 数组,
-- 例如: '("acme_tenant","beta_tenant")'. dev / staging 留空即可 (改成 NULL 列表).
INSERT INTO "member" ("id", "user_id", "organization_id", "role", "created_at")
SELECT
  'mem_' || u.id,
  u.id,
  'org_default',
  CASE
    -- 注: ADMIN_ORG_IDS 占位符需要在执行前替换为实际 tenant_keys; 见上方注释
    -- WHEN u.organization_id IN ('tenant_key_1', 'tenant_key_2') THEN 'admin'
    WHEN u.role = 'admin' THEN 'admin'
    ELSE 'hr'
  END,
  NOW()
FROM "user" u
ON CONFLICT ("user_id", "organization_id") DO NOTHING;

-- 7.3 把第一个 admin 提升为 owner
UPDATE "member"
SET "role" = 'owner'
WHERE "id" = (
  SELECT "id" FROM "member"
  WHERE "organization_id" = 'org_default' AND "role" = 'admin'
  ORDER BY "created_at" ASC
  LIMIT 1
);

-- 7.4 业务表 backfill organizationId
UPDATE "studio_interview"                       SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "department"                             SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "interviewer"                            SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "job_description"                        SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "candidate_form_template"                SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "interview_question_template"            SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "chat_conversation"                      SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "chat_attachment"                        SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "feishu_thread_state"                    SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "interview_conversation"                 SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "interview_conversation_turn"            SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "interview_audit_log"                    SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "interview_notification"                 SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "studio_interview_schedule"              SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "candidate_form_submission"              SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "interview_question_template_binding"    SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "chat_message"                           SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;

-- 7.5 global_config 也 backfill (保留 singleton 行,仅打 org 标识)
UPDATE "global_config"
SET "organization_id" = 'org_default'
WHERE "id" = 'singleton' AND "organization_id" IS NULL;

-- 7.6 user 表 feishuTenantKey / feishuTenantName backfill (从旧列复制)
UPDATE "user"
SET "feishu_tenant_key"  = "organization_id",
    "feishu_tenant_name" = "organization_name"
WHERE "feishu_tenant_key" IS NULL AND "organization_id" IS NOT NULL;
```

**理由解释**：

- 每条 `UPDATE ... WHERE organization_id IS NULL` 是幂等的——重跑无副作用
- `ON CONFLICT DO NOTHING` 同样幂等
- ADMIN_ORG_IDS 占位符注释提醒 op 在生产执行前替换为实际值；dev/staging 跑了也无害（admin 群体先空着，后续手工提升）

- [ ] **Step 3: Commit**

```
git add drizzle/
git commit -m "feat(db): append default-workspace + business-table backfill to migration"
```

---

## Task 8 — 本地应用迁移 + 验证

**Files:** 无源文件改动；仅本地数据库

- [ ] **Step 1: 应用 migration**

Run:

```
pnpm db:migrate
```

Expected: PASS — 看到新的 migration 被 apply 的输出。**没有**任何 ERROR 行。

如果失败：

- 可能是历史数据违反 FK：某个 chat_message.conversation_id 指向不存在的 conversation。**停**——这是数据完整性问题，需要排查再决定怎么修。

- [ ] **Step 2: psql 直接验证**

Run:

```
psql "$DATABASE_URL" -c "SELECT id, slug FROM organization;" -c "SELECT COUNT(*) FROM member WHERE organization_id='org_default';" -c "SELECT COUNT(*) FROM studio_interview WHERE organization_id IS NULL;" -c "SELECT COUNT(*) FROM studio_interview WHERE organization_id = 'org_default';" -c "SELECT id, organization_id FROM global_config;" -c "SELECT id, organization_id, feishu_tenant_key FROM \"user\" LIMIT 5;"
```

Expected:

1. 第一条查到 `org_default | default`
2. 第二条 COUNT(\*) = 现有用户数（>0）
3. 第三条 COUNT(\*) = 0（无 NULL）
4. 第四条 COUNT(\*) = 现有 studio_interview 总数
5. 第五条返回 `singleton | org_default`
6. 第六条 sample 行的 `feishu_tenant_key` = `organization_id`（旧列复制过来）

如果任一不匹配，停下报告 BLOCKED。

- [ ] **Step 3: 抽样检查另外几张业务表的 backfill**

Run:

```
psql "$DATABASE_URL" -c "SELECT 'studio_interview' AS t, COUNT(*) FILTER (WHERE organization_id IS NULL) AS null_rows, COUNT(*) AS total FROM studio_interview UNION ALL SELECT 'job_description', COUNT(*) FILTER (WHERE organization_id IS NULL), COUNT(*) FROM job_description UNION ALL SELECT 'chat_message', COUNT(*) FILTER (WHERE organization_id IS NULL), COUNT(*) FROM chat_message UNION ALL SELECT 'interview_conversation_turn', COUNT(*) FILTER (WHERE organization_id IS NULL), COUNT(*) FROM interview_conversation_turn;"
```

Expected: 每行 `null_rows` 都是 0。

- [ ] **Step 4: Full verify**

Run:

```
pnpm typecheck && pnpm test && pnpm check
```

Expected: 全 PASS。

- [ ] **Step 5: (无 commit 步骤；本 task 仅验证)**

---

## Task 9 — 推到远端

**Files:** 无源文件改动

- [ ] **Step 1: push 分支**

Run:

```
git push
```

Expected: 远端 `feat/multi-tenant-p0-foundation` 分支被更新。

- [ ] **Step 2: 简报**

P1 完成。当前 branch 状态：

- 17 张业务表 + `global_config` + `user` 都加了多租户必备列
- 默认 workspace `org_default` 已建，所有现存用户已加为 member
- 历史业务数据全部 backfill 到 `org_default`
- DAOs / 路由 / UI **未改动**——应用行为完全不变

P2 接管：路由 / DAOs / UI。

---

## 验证清单（done 标准）

- ☐ Task 1-9 全部勾完
- ☐ `pnpm typecheck` PASS
- ☐ `pnpm test` PASS（P0 那 69 个 case 仍绿；本期不新增测试）
- ☐ `pnpm check` PASS
- ☐ `pnpm db:migrate` 应用成功，psql 验证 6 条全过
- ☐ 17 张业务表 + global_config 在生产数据上 `organization_id IS NULL` 计数都是 0
- ☐ branch 推到 origin

完成上述清单即认为 P1 落地。
