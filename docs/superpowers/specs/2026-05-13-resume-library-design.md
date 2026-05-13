# Resume Library (简历库) — Design

Status: Approved 2026-05-13
Owner: allen

## Goal

Add a 简历库 page under the "工作台" sidebar group that shares the existing
`studioInterview` table with AI 面试, but presents it as a candidate roster —
hiding interview-specific data (rounds, questions, transcripts, reports) and
supporting standalone resume uploads that don't trigger interview-question
generation.

Out of scope: any new tables, any change to the AI 面试 page layout, any new
candidate-form / interviewer / JD flows.

## Why now

Recruiters want a stable address for "all our candidates" without the noise of
interview-flow state. They also want to ingest a resume PDF without paying for
the LLM round-trip that generates interview questions — sometimes they're
just collecting CVs and haven't decided whether the candidate will get an AI
interview at all.

## Data model

No schema changes. `studioInterview` rows already carry every candidate /
resume field we need (`candidateName`, `candidateEmail`, `candidatePhone`,
`targetRole`, `jobDescriptionId`, `notes`, `resumeFileName`,
`resumeStorageKey`, `resumeContentHash`, `resumeProfile`). Records created
through the resume library are normal `studioInterview` rows with:

- `interviewQuestions: []`
- `status: "draft"`
- no `studioInterviewSchedule` rows

The AI 面试 page already tolerates these (it shows them with `当前轮次 = 未安排`,
`题目数 = 0`). The 简历库 page just hides those columns.

## Backend

### Folder layout

New sibling of `interviews/` under `src/server/routes/studio/routes/`:

```
src/server/routes/studio/routes/resumes/
  route.ts
  dao/
    resumes.ts
```

Mounted at `/resumes` in the parent `src/server/routes/studio/route.ts`.

The router declares `.use("*", authMiddleware)` internally per the route-layout
convention; `app.ts` only mounts.

### Endpoints

| Method | Path           | Permission      | Notes                                               |
| ------ | -------------- | --------------- | --------------------------------------------------- |
| GET    | `/`            | `resume:read`   | Paginated list with search filter                   |
| GET    | `/:id`         | `resume:read`   | Detail DTO — candidate + resumeProfile only         |
| GET    | `/:id/resume`  | `resume:read`   | PDF stream (reuses `getObjectStream`)               |
| POST   | `/`            | `resume:create` | Upload — parses profile, **no** question generation |
| PATCH  | `/:id`         | `resume:update` | Candidate/resume fields only                        |
| DELETE | `/:id`         | `resume:delete` | Single delete                                       |
| POST   | `/bulk-delete` | `resume:delete` | Bulk delete                                         |

`PATCH /:id` MUST NOT write `interviewQuestions`, `status`, or schedule rows —
those belong to AI 面试 flows. Drizzle update set is restricted to candidate
columns and `resumeStorageKey` / `resumeContentHash` / `resumeFileName` /
`resumeProfile` (when a new PDF is uploaded).

### Upload pipeline

POST `/` accepts multipart form data:
`resume` (File, optional), plus candidate fields (`candidateName`,
`candidateEmail`, `candidatePhone`, `targetRole`, `jobDescriptionId`, `notes`).

Server-side:

1. If `resume` present, run `storeInterviewResume(...)` (reused from
   interviews) to put it in R2 / fetch `cachedResumeProfile` if registry has
   the hash.
2. If no client-prebaked payload and no registry cache hit, call
   `parseResumeFastToProfile(resume)` (NOT `analyzeResumeFile`) — this gives
   us `resumeProfile` without spending tokens on question generation.
3. Insert one `studioInterview` row: `interviewQuestions: []`,
   `status: "draft"`, `id: crypto.randomUUID()`, `organizationId`,
   `createdBy`, `createdAt`/`updatedAt = now`. No `studioInterviewSchedule`
   inserts.
4. `revalidateTag("studio-resumes")` AND `revalidateTag("studio-interviews")`.

Client-side prebaking + identity dedup work the same as on AI 面试 and SHOULD
be kept — they prevent the same PDF / same person being entered twice.
Question generation is the only part dropped.

### DAO

`dao/resumes.ts` exports `queryPaginatedResumeRecords`, `loadResumeById`,
`queryResumeSummary` (only used if we change our mind about stats; not used
day-1).

Selected columns (no schedule join):

```
candidateName, candidateEmail, candidatePhone, targetRole, notes,
jobDescriptionId, jobDescriptionName (via leftJoin),
resumeFileName, resumeStorageKey, resumeContentHash,
createdAt, createdBy, creatorName (user.name),
creatorOrganizationName (user.feishuTenantName),
updatedAt, id, hasResumeFile (boolean derived)
```

Sort columns: `createdAt`, `candidateName`, `updatedAt`. Search hits across
`candidateName`, `candidateEmail`, `candidatePhone`, `resumeFileName`,
`targetRole` (no schedule-label search).

Pagination DTO matches the existing `PaginatedStudioInterviewResult` shape so
the DataGrid binding is identical.

Cached server-component variant: `listResumeRecords` with
`"use cache"` + `cacheTag("studio-resumes")` + `cacheLife("minutes")`.

### Cross-tag invalidation

The 简历库 and AI 面试 pages read the same underlying rows. Both pages tag
their cached reads, and every mutation in either route MUST invalidate both
tags:

- `resumes` route: bump `studio-resumes` and `studio-interviews`.
- `interviews` route: bump `studio-interviews` and `studio-resumes` (small
  patch — current code only bumps `studio-interviews` in ~4-5 places, all
  via `safeUpdateTag("studio-interviews")`).

A shared helper `invalidateStudioInterviewCaches()` is the cleanest place to
encode this rule so we don't drift.

## Permissions

`src/lib/shared/permissions.ts` adds `resume: ["create","read","update",
"delete"]` mirroring each role's existing `interview` grants.

The new resource is RBAC-only — there is no row-level isolation between
`resume:read` and `interview:read` because they back the same table. The
distinction exists to leave headroom for "HR sees the roster, doesn't see
interview reports" without rewriting permissions later.

## Frontend

### Sidebar

In `studio-sidebar-slots.tsx`, add to the "工作台" group, after `AI 面试`:

```ts
{
  action: "read",
  icon: UsersIcon,
  path: "/studio/resumes",
  resource: "resume",
  title: "简历库",
}
```

### Pages / components

```
src/app/(auth)/w/[slug]/studio/resumes/
  page.tsx
  _components/
    resume-library-page.tsx
    upload-resume-dialog.tsx
    edit-resume-dialog.tsx
    resume-detail-dialog.tsx
```

`page.tsx`: Server Component, awaits `connection()`, resolves active org,
calls cached `listResumeRecords(orgId)` for the first paint.

`resume-library-page.tsx`: client component, uses `useDataGridState` with
`fetcher` calling `rpc.api.w[":slug"].studio.resumes.$get(...)` via
`rpcFetch`. Dialog state mirrors interview-management-page but the dialogs
are the resume-\* variants.

### List columns

| Column     | Source                                                      | Sortable |
| ---------- | ----------------------------------------------------------- | -------- |
| select     | row selection                                               | —        |
| 候选人     | candidateName + candidateEmail                              | yes      |
| 目标岗位   | targetRole                                                  | no       |
| 关联岗位   | jobDescriptionName (clickable → JobDescriptionViewDialog)   | no       |
| 简历文件   | resumeFileName (clickable → PDF preview if `hasResumeFile`) | no       |
| 创建人     | creatorName                                                 | no       |
| 创建人组织 | creatorOrganizationName                                     | no       |
| 创建时间   | createdAt                                                   | yes      |
| 操作       | 查看详情 / 编辑 / 发起 AI 面试 / 删除                       | —        |

Hidden vs AI 面试 page: 状态 / 当前轮次 / 题目数 / 复制面试链接.

Toolbar:

- Filter: search input (no status select).
- Right: `上传简历` button (`UploadResumeDialog`).
- Bulk action: 删除.

No stats cards.

Pinning: `select` + `candidateName` pinned left, `actions` pinned right
(same convention as interview list).

### `UploadResumeDialog`

Fields: PDF dropzone (optional), 候选人姓名 (optional — falls back to
parsed profile), 邮箱, 电话, 目标岗位, 关联 JD (select), 备注.

Submits multipart to `POST /api/w/:slug/studio/resumes`. Reuses
client-side resume prebake and dedup-warning UI from the interview create
dialog (extract shared bits if duplication crosses a threshold; otherwise
copy and refactor in a follow-up).

### `EditResumeDialog`

Same fields. PDF replacement optional. Submits `PATCH
/api/w/:slug/studio/resumes/:id`. Server discards anything that isn't a
candidate/resume field even if the client sends it.

### `ResumeDetailDialog`

Sections:

1. 候选人基本信息 — name / email / phone / targetRole / jobDescription.
2. 简历 — file name + 「预览 PDF」 button (uses `/api/w/:slug/studio/resumes/:id/resume`).
3. 备注 — notes (textarea-rendered as text).
4. 结构化简历 — render `resumeProfile` (education, experience, skills, etc.)
   using the same formatter the interview detail dialog uses; extract a
   shared `ResumeProfileView` component if the formatter isn't already a
   shared component.

Footer actions:

- `发起 AI 面试` → navigates to `/w/:slug/studio/interviews?recordId=:id`.
  The interviews page already consumes `?recordId=` to auto-open the
  interview detail dialog (see `interview-management-page.tsx` ll. 148-165),
  so no extra wiring needed.
- `编辑` → opens `EditResumeDialog`.
- `关闭`.

Explicitly absent: interview questions list, schedule entries, transcript,
AI report.

## Sidebar group placement

```
工作台
  AI 面试
  简历库   ← new, below AI 面试
```

## Open questions handled by recommendations (per user 2026-05-13)

- "发起 AI 面试" 入口: included, as a footer button in `ResumeDetailDialog`
  and an action in the row menu — both link to
  `/studio/interviews?recordId=:id`.
- Sidebar icon: `UsersIcon` (lucide).
- Upload pipeline keeps client-side prebake + identity dedup; only the
  question-generation step is dropped.

## Risks

- **Cache drift** between `studio-resumes` and `studio-interviews` if a future
  mutation forgets to invalidate both. Mitigated by the shared
  `invalidateStudioInterviewCaches()` helper — all mutations call it.
- **Schema bleed**: `resumeRouter` could grow handlers that touch interview
  columns; PATCH must explicitly enumerate writable columns rather than
  spreading the parsed body.
- **DTO duplication** between `StudioInterviewListRecord` and
  `ResumeLibraryRecord`. Kept intentional — they're allowed to diverge
  (e.g. resume library can drop `scheduleEntries`, AI 面试 will keep them).

## Test plan (high level)

- DAO: list/search/sort returns expected projections; PATCH refuses to
  touch interview fields (unit test the writable-column whitelist).
- Upload: POST without `resume` succeeds and creates a manual row; POST
  with PDF stores blob and parses profile but doesn't call
  `generateInterviewQuestionsForProfile` (mock and assert not-called).
- Cross-tag: writing through `/resumes` invalidates both tags;
  writing through `/interviews` invalidates both tags.
- Permissions: viewer role with only `resume:read` can list and view but
  not upload/edit/delete.
- UI smoke: sidebar entry appears, list renders, upload + edit + delete +
  bulk-delete round-trip works.
