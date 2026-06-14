# 简历池 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「简历池」作为入库前暂存层，支持「我的简历池」「公共简历池」、私有推公共、从任一池入库到现有简历库，并在简历库记录中保留来源。

**Architecture:** 简历池使用独立表，不提前写入 `studio_interview`。私有池按当前组织 + 当前用户隔离；公共池为平台级共享，所有组织用户可读。入库时复制池记录到现有 `studio_interview`，并通过 `resume_pool_import` 记录每个组织的入库关系。私有推公共采用复制发布，保留原私有记录。

**Tech Stack:** Hono、Drizzle ORM、PostgreSQL、Zod、TanStack Start/Router/Query、Vitest。后端路由遵循 `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/<feature>/` 自包含结构。

---

## File Map

| File                                                                                                      | Action | Purpose                                                              |
| --------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| `packages/db-schema/src/schema.ts`                                                                        | Modify | 增加简历池表、入库关系表、事件表；给 `studio_interview` 增加来源字段 |
| `packages/db-schema/src/relations.ts`                                                                     | Modify | 增加简历池关系                                                       |
| `packages/shared/src/resume-pool.ts`                                                                      | Create | 共享 DTO、Zod schema、枚举元信息                                     |
| `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/schema.ts`               | Create | 路由输入 schema                                                      |
| `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/dao.ts`                  | Create | 查询、发布、入库、事件 DAO                                           |
| `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/route.ts`                | Create | Hono API                                                             |
| `apps/ai-recruitment-copilot-backend/src/server/routes/studio/route.ts`                                   | Modify | 挂载 `/resume-pool`                                                  |
| `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/__tests__/dao.test.ts`   | Create | DAO 行为测试                                                         |
| `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/__tests__/route.test.ts` | Create | 路由权限和状态测试                                                   |
| `apps/ai-recruitment-copilot/drizzle/<timestamp>_add_resume_pool/migration.sql`                           | Create | 手写或生成迁移                                                       |

---

## Phase 1 Scope

本次实现只做后端核心闭环：

- 创建、列表、详情、PDF 预览。
- 我的简历池推送到公共简历池。
- 我的简历池 / 公共简历池入库到简历库。
- 简历库记录保存来源字段。

不在本次实现：

- 新的简历池前端页面。
- 批量上传到简历池。
- 公共池平台治理后台。
- 认领、30 天回池、推荐组织面试等后续自动流转。

---

## Data Model

### `resume_pool_item`

单条池中简历。私有池记录有 `organizationId + createdBy`；公共池记录仍保留来源组织和来源用户，但列表读取不按当前组织过滤。

Required columns:

- `id`
- `scope`: `"private" | "public"`
- `organizationId`: 私有池所属组织；公共池可为发布组织，用于来源追踪
- `createdBy`
- `sourcePoolItemId`
- `sourceOrganizationId`
- `sourceUserId`
- `publishedAt`
- `publishedBy`
- `candidateName`
- `candidateEmail`
- `candidatePhone`
- `targetRole`
- `notes`
- `resumeFileName`
- `resumeStorageKey`
- `resumeContentHash`
- `resumeParseStatus`
- `resumeParseError`
- `resumeParsedAt`
- `resumeProfile`
- `skillsNormalized`
- `jobDescriptionId`
- `status`: `"active" | "archived"`
- timestamps

Indexes:

- `(scope, created_at)`
- `(organization_id, created_by, scope, created_at)`
- `(resume_content_hash)`
- `(resume_parse_status)`
- GIN on `skills_normalized`

### `resume_pool_import`

记录每个组织从某条池记录入库到哪个简历库记录。公共简历池允许多个组织分别入库同一条 pool item。

Required columns:

- `id`
- `poolItemId`
- `organizationId`
- `importedResumeRecordId`
- `importedBy`
- `importedAt`

Unique indexes:

- `(pool_item_id, organization_id, imported_resume_record_id)`

### `resume_pool_event`

审计日志。

Types:

- `created`
- `parsed`
- `published`
- `imported`
- `archived`
- `restored`

---

## Task 1: Add DB Schema And Migration

**Files:**

- Modify: `packages/db-schema/src/schema.ts`
- Modify: `packages/db-schema/src/relations.ts`
- Create: `apps/ai-recruitment-copilot/drizzle/20260614090000_add_resume_pool/migration.sql`

- [ ] Add `ResumePoolScope`, `ResumePoolStatus`, `ResumePoolEventType`, and `StudioInterviewResumeSourceType` exported types.
- [ ] Add `resumePoolItem`, `resumePoolImport`, and `resumePoolEvent` tables.
- [ ] Add `studioInterview.resumeSourceType`, `resumeSourcePoolItemId`, `resumeSourceImportedAt`, `resumeSourceImportedBy`.
- [ ] Add relations for pool item imports/events and import to `studioInterview`.
- [ ] Write migration SQL with table creation and indexes.
- [ ] Run focused schema typecheck.

Verification:

```bash
pnpm --filter @arc/db-schema typecheck
```

---

## Task 2: Shared DTOs And Schemas

**Files:**

- Create: `packages/shared/src/resume-pool.ts`

- [ ] Define `resumePoolScopeSchema`, `resumePoolStatusSchema`, `resumePoolImportInputSchema`.
- [ ] Define list/detail DTOs with ISO timestamp strings.
- [ ] Define `ResumePoolImportDuplicateResult` and `ResumePoolImportSuccessResult`.
- [ ] Add helpers for labels: `我的简历池`, `公共简历池`.

Verification:

```bash
pnpm --filter @arc/shared typecheck
```

---

## Task 3: Write DAO Tests First

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/__tests__/dao.test.ts`

Tests:

- [ ] Private list only returns rows where `organizationId = activeOrg` and `createdBy = currentUser`.
- [ ] Public list returns public rows across organizations.
- [ ] Publishing private item creates a new public item and keeps private item unchanged.
- [ ] Importing public item creates a `studioInterview` row for the current org and creates a `resume_pool_import` row.
- [ ] Importing private item is denied for a different user or organization.

RED verification:

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend test -- src/server/routes/studio/routes/resume-pool/__tests__/dao.test.ts
```

Expected: fail because DAO/module does not exist.

---

## Task 4: Implement DAO

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/dao.ts`

Functions:

- `createResumePoolItem`
- `queryResumePoolItems`
- `loadResumePoolItem`
- `publishPrivatePoolItem`
- `importPoolItemToResumeLibrary`
- `archiveResumePoolItem`
- `writeResumePoolEvent`

Rules:

- Private read: `scope = private AND organizationId = currentOrg AND createdBy = currentUser`.
- Public read: `scope = public AND status = active`, no organization filter.
- Publish: copy private item to new public item; original private item remains active.
- Import: call existing `createResumeRecordFromStorage`; then write `resume_pool_import`.
- Public import does not reuse public item `jobDescriptionId` unless it belongs to the current organization; API should require explicit `jobDescriptionMode`.

Verification:

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend test -- src/server/routes/studio/routes/resume-pool/__tests__/dao.test.ts
```

---

## Task 5: Write Route Tests First

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/__tests__/route.test.ts`

Tests:

- [ ] `GET /resume-pool?scope=private` requires auth and returns private rows.
- [ ] `GET /resume-pool?scope=public` returns public rows visible from another org.
- [ ] `POST /:id/publish` rejects non-owner private rows.
- [ ] `POST /:id/import` returns duplicate matches when `dedupPolicy = check`.

RED verification:

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend test -- src/server/routes/studio/routes/resume-pool/__tests__/route.test.ts
```

Expected: fail because route is not mounted.

---

## Task 6: Implement Route

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/schema.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/route.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/route.ts`

Endpoints:

```txt
GET    /resume-pool?scope=private|public
GET    /resume-pool/:id
GET    /resume-pool/:id/resume
POST   /resume-pool
POST   /resume-pool/:id/publish
POST   /resume-pool/:id/import
POST   /resume-pool/:id/archive
```

Upload behavior:

- Validate PDF via existing `validateResumeFile`.
- Store PDF via existing storage helper.
- Parse server-side if no cached profile exists.
- Insert pool row only; do not insert `studio_interview`.

Import behavior:

- `dedupPolicy = "check"`: return duplicate matches before insert.
- `dedupPolicy = "force"`: insert despite matches.
- `jobDescriptionMode = "none" | "bind"`.
- `auto` can be added later; skip first implementation unless trivial to reuse safely.

Verification:

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend test -- src/server/routes/studio/routes/resume-pool/__tests__/route.test.ts
```

---

## Task 7: Focused Typecheck And Lint

**Files:** all modified files.

Verification:

```bash
pnpm --filter @arc/db-schema typecheck
pnpm --filter @arc/shared typecheck
pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
pnpm check
```

Expected:

- Typecheck exits 0 for touched packages.
- `pnpm check` exits 0, or reports unrelated pre-existing issues that are documented in the final response.
