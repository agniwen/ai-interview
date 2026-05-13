# Resume Library Upload: Mirror AI Interview Analysis Flow

**Date:** 2026-05-13
**Status:** Design — pending user review

## 1. Goal

简历库的「上传简历」对话框 (`UploadResumeDialog`) 升级为「新建简历记录」对话框：

1. 接入与 AI 面试「新建面试记录」对话框 (`CreateInterviewDialog`) 等价的简历分析流水线
   - 上传 PDF → **流式解析** ResumeProfile → 自动回填姓名 / 邮箱 / 电话 / 目标岗位，并显示流式进度
   - **自动匹配在招 JD**，命中后回填 `jobDescriptionId`
   - 身份维度查重命中时弹 `ResumeDedupOverlay`，用户确认后继续
   - **流式生成面试题** → 保存进 `studioInterview.interviewQuestions`
2. **双提交按钮**：
   - 「保存」→ 仅入库（与当前简历库语义对齐）
   - 「保存并发起面试」→ 入库 + 自动写入 1 条默认面试轮次（一键升格为 AI 面试）

副产物：抽出 `useResumeAnalysisPipeline` hook 与 `<ResumeAnalysisOverlay>` 组件，简历库与 AI 面试两边复用，消除 ~200 行流式逻辑重复。

## 2. Non-goals

- 不修改 AI 面试 `CreateInterviewDialog` 的对外行为（仅做内部重构以复用 hook）。AI 面试新建仍是「多轮 / 自定义排期 / Agent 提示词」的完整入口。
- 简历库新建对话框**不内嵌** `<InterviewScheduleFields>`。「保存并发起面试」走默认 schedule，需要精细配置走 AI 面试详情页或 AI 面试新建入口。
- 不改简历库 PATCH `/studio/resumes/:id` 的语义（编辑流程目前不重跑分析，本次保持现状）。
- 不修改 `studioInterview` 表 schema 或 `studioInterviewSchedule` 表 schema。
- 不动详情弹窗中已有的「发起 AI 面试」跳转按钮（与本次双按钮共存，互补）。

## 3. Architecture

### 3.1 共享层 (new)

**`src/app/(auth)/w/[slug]/studio/_components/use-resume-analysis-pipeline.ts`** — 自定义 hook。
负责整个 "parse → JD match → dedup → questions" 流水线的状态与生命周期，组件无关。

接口签名（草案）：

```ts
export interface ResumeAnalysisPipelineOptions {
  /** 解析完成（Step 1）后回调，用于回填表单。 */
  onProfileParsed: (input: { fileName: string; resumeProfile: ResumeProfile }) => void;
  /** JD 自动匹配命中时回调。 */
  onJobDescriptionMatched: (matchedId: string) => void;
  /** Step 2 题目生成完成时回调。 */
  onQuestionsGenerated: (questions: InterviewQuestion[]) => void;
}

export interface ResumeAnalysisPipelineState {
  isAnalyzingResume: boolean;
  isGeneratingQuestions: boolean;
  progressStatus: string;
  progressTools: { name: string; done: boolean }[];
  partialFields: { label: string; value: string }[];
  dedupMatches: DedupMatchRecord[] | null;
  /** Step 1 完成后非空，提交时附给 POST 的 resumePayload。 */
  resumePayload: ResumeAnalysisResult | null;
  resumeFile: File | null;
  /** 流水线整体是否处于"忙"，等同于 isAnalyzingResume || isGeneratingQuestions || dedupMatches != null。 */
  isBusy: boolean;
}

export interface ResumeAnalysisPipelineHandlers {
  handleResumeChange: (file: File | null) => Promise<void>;
  handleDedupContinue: () => void;
  handleCancelAnalysis: () => void;
  /** 关闭对话框时调用，清空所有瞬时状态并 abort in-flight 请求。 */
  reset: () => void;
}

export function useResumeAnalysisPipeline(
  options: ResumeAnalysisPipelineOptions,
): ResumeAnalysisPipelineState & ResumeAnalysisPipelineHandlers;
```

内部实现 = 把 `create-interview-dialog.tsx` 当前 `handleResumeChange` / `runQuestionGeneration` / `handleDedupContinue` / `handleCancelAnalysis` / `tryExtractPartialFields` / `handleStreamEvent` 原样搬过来，相关 `useState` / `useRef` 也搬到 hook 里。

`useResumeAnalysisPipeline` 内部使用：

- `useWorkspaceSlug()` 拿 slug
- dedup 查重统一走 `fetchInterviewDedup`（命中 `/api/w/:slug/studio/interviews/dedup-check`），底层与 `fetchResumeDedup` 共用同一个 DAO `queryInterviewDedup`，结果等价；统一到一个端点避免维护两套客户端 helper
- `/studio/resumes/dedup-check` 路由保留，不在本次清理范围

**`src/app/(auth)/w/[slug]/studio/_components/resume-analysis-overlay.tsx`** — 新组件。
封装"忙状态浮层"，参数为 `ResumeAnalysisPipelineState` 的子集 + `onCancel` / `onDedupContinue` 回调。内部含：

- `motion.div` 半透明 backdrop
- 命中 dedup → 渲染 `<ResumeDedupOverlay>`
- 其余 → 渲染 loader、`progressStatus` / TextFlip、tool list、partialFields、取消按钮

### 3.2 AI 面试侧重构 (CreateInterviewDialog)

`create-interview-dialog.tsx` 改为：

- 调用 `useResumeAnalysisPipeline` 拿状态 + 回调
- `onProfileParsed` 里回填表单四个字段
- `onJobDescriptionMatched` 回填 `jobDescriptionId`
- `onQuestionsGenerated` 写 `form.setFieldValue("interviewQuestions", questions)`
- 渲染 `<ResumeAnalysisOverlay>` 替换原 `motion.div` 块
- 行为不变；做端到端回归（手动 + 单测覆盖）

### 3.3 简历库侧改造 (UploadResumeDialog → CreateResumeRecordDialog)

`upload-resume-dialog.tsx` 改造（文件保留原名以减小 diff，导出组件重命名为 `CreateResumeRecordDialog`，外部调用点同步改）：

- 接入 `useResumeAnalysisPipeline`
- `onProfileParsed` 回填 `candidateName / candidateEmail / candidatePhone / targetRole`
- `onJobDescriptionMatched` 回填 `jobDescriptionId`
- `onQuestionsGenerated` 不再 setState（hook 内 `resumePayload` 已含 questions），提交时直接附 hook 暴露的 `resumePayload`
- 因 dedup 已由 hook 接管，删掉本文件内 `pendingFormDataRef` / `fetchResumeDedup` / `handleDedupContinue` / `handleDedupCancel` 旧分支
- 沿用 `CandidateFormFields`，把 hook 的进度状态摘要挂到 `resumeFieldExtra`；完整浮层由 `<ResumeAnalysisOverlay>` 覆盖（绝对定位铺满 Modal）

**Footer 双按钮**：

```tsx
<Button variant="outline" disabled={isBusy} onClick={() => void handleSubmit("save-only")}>
  保存
</Button>
<Button disabled={isBusy} onClick={() => void handleSubmit("save-and-start")}>
  保存并发起面试
</Button>
```

`handleSubmit(mode)`：

- `"save-only"` → 组装 FormData（含 `resumePayload`）→ POST `/api/w/:slug/studio/resumes` → `onCreated` 回调拿到 `ResumeLibraryDetail` → 列表/详情走 resume 路径
- `"save-and-start"` → 组装 FormData（含 `resumePayload` + 默认 `scheduleEntries`，见 §3.4）→ POST `/api/w/:slug/studio/interviews` → `onCreated` 回调拿到 `StudioInterviewRecord` → 弹 toast「已创建并发起 1 轮面试」，可选跳转到 AI 面试详情页（见 §4 Open Items）

`onCreated` 回调签名扩展为 union：

```ts
type CreateResumeRecordResult =
  | { mode: "save-only"; detail: ResumeLibraryDetail }
  | { mode: "save-and-start"; record: StudioInterviewRecord };

interface CreateResumeRecordDialogProps {
  onCreated: (result: CreateResumeRecordResult) => void;
}
```

`ResumeLibraryPage` 处理 union：`save-only` 直接 prepend 到列表，`save-and-start` 也 prepend（同一张 `studioInterview` 表，列表 DTO 拿得到，targetRole/notes 等都还在）。

UI 副本调整见 §4。

### 3.4 后端

#### 3.4.1 POST `/api/w/:slug/studio/resumes`（「保存」路径）

当前 `route.ts:159-228` 行为：

- 服务端从 `formData.get("resume")` 取文件 → `parseResumeFastToProfile` 兜底解析
- `interviewQuestions: []` 硬编码

改造：

1. 表单新增可选字段 `resumePayload`（JSON string）。结构同 `ResumeAnalysisResult`（`fileName + resumeProfile + interviewQuestions`）。
2. 解析逻辑变更：
   - 优先读 `resumePayload` —— 直接拿到 profile + questions
   - 没有时退回现行 `uploadResult.cachedResumeProfile` / `parseResumeFastToProfile`，**questions 仍保持空数组**（不在服务端补跑题目生成）
3. 落库时 `interviewQuestions = resumePayload?.interviewQuestions ?? []`
4. `resumeProfile`、`candidateName` 等回填策略不变（用户输入优先，profile fallback）
5. 复用 AI 面试 route 已有的 `parseResumePayloadInput` helper（建议抽到 `@/server/routes/interview/utils` 或共享路径），避免重复实现 JSON 校验

理由：本设计的题目生成全程在客户端流式完成，服务端兜底跑题既会重复 LLM 调用，又会让简单的 POST 变成长任务。如果前端不传 `resumePayload`（例如客户端在 Step 2 中途断网），那条简历记录的 `interviewQuestions` 就是空，与现状一致——后续可通过编辑流程补回。

#### 3.4.2 POST `/api/w/:slug/studio/interviews`（「保存并发起面试」路径）

复用现有 `/studio/interviews` POST handler，**无后端改动**。前端组装 FormData 时附：

- `resumePayload`（同上）
- `scheduleEntries`（JSON string）—— 由前端注入**默认值**：

```ts
const DEFAULT_SCHEDULE_ENTRY: ScheduleEntryInput = {
  roundLabel: "初轮",
  scheduledAt: new Date().toISOString(), // 立即可面，候选人点开链接即可进入
  notes: "",
  allowTextInput: true,
};
```

- `status` 字段：默认 `"ready"`（沿用 AI 面试 POST 的默认）

> 之所以选 `scheduledAt = now`：现有 `studioInterviewSchedule` schema 中 `scheduledAt` 为 `NOT NULL`（见 `db/schema.ts`，本设计实施前需 grep 确认；若是 nullable 则改用 `null` 语义更清晰）。

`autoBindApplicableTemplates` 等副作用沿用 AI 面试 POST 现有事务逻辑，不另写。

#### 3.4.3 schema migration

不需要 —— `studioInterview.interviewQuestions` 已是 JSON 数组，简历库行此前存空数组，现在可能存非空，DB 层无变化。schedule 表也无字段新增。

### 3.5 简历库详情 (StudioPersonDetailDialog mode="resume")

把 AI 题目 tab 同步显示给简历模式：

- `studio-person-detail-dialog.tsx`
  - `UnifiedRecord.interviewQuestions` 在 resume 分支也填充（从 `resumeRecord.interviewQuestions` 取，DTO 需暴露——见下）
  - Tabs 里 `mode === "interview"` 的 `value="questions"` 改成 `mode === "interview" || (mode === "resume" && interviewQuestions.length > 0)`，文案保持「AI 题目」
  - 不允许在简历库详情里重新生成或编辑题目（只读）

DTO 改动：

- `ResumeLibraryDetail` (`@/lib/shared/studio-resumes.ts`) 增加 `interviewQuestions: InterviewQuestion[]`
- `loadResumeDetail` DAO 把 `studioInterview.interviewQuestions` 字段拉出来塞进 DTO
- `ResumeLibraryListRecord` 不动（列表行保持精简）

编辑弹窗 (`studio-person-edit-dialog.tsx`) 不展示也不修改面试题；保持当前「候选人信息字段只」的边界。

## 4. 文案改动

| 位置                            | 旧                                                               | 新                                                                                    |
| ------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 触发按钮（resume-library-page） | 「上传简历」                                                     | 「新建简历记录」                                                                      |
| Modal `title`                   | 「上传简历」                                                     | 「新建简历记录」                                                                      |
| Modal `description`             | 「将候选人简历加入简历库。不会生成面试题，也不会发起 AI 面试。」 | 「上传 PDF 自动解析候选人信息、匹配岗位并生成面试题；可仅入库，或一键发起 AI 面试。」 |
| Footer 主按钮                   | 「确认上传」                                                     | 「保存并发起面试」                                                                    |
| Footer 次按钮                   | （无）                                                           | 「保存」（variant=outline）                                                           |
| 成功 toast (save-only)          | 「简历已加入简历库」                                             | 「简历记录已创建」                                                                    |
| 成功 toast (save-and-start)     | （无）                                                           | 「已创建并发起 1 轮面试」                                                             |

代码内注释维护双语（per CLAUDE.md memory）。

### Open Items（文案 / UX 待你拍板）

1. **「保存并发起面试」后是否跳转到 AI 面试详情页？** 默认 toast 提示，停留在简历库列表；如果想 push 到 `/studio/interviews?recordId=…`，需要从 `ResumeLibraryPage` 拿到 router 并在 onCreated 回调里处理。我的推荐：**不跳转**，列表 prepend + toast 即可，用户主动需要时再点详情进入。
2. **默认 schedule 的 `scheduledAt`**：当前设计选了 `new Date().toISOString()`（立即可面）。备选：用户在弹窗里多加一个「面试时间」字段（DateTimePicker）作为「保存并发起面试」的必填项 —— 这会让简历库弹窗体积更接近 AI 面试新建，违背我们的轻量化目标。建议保持默认值，需要精细排期走 AI 面试详情页编辑。
3. **`scheduledAt` 字段是否真的 NOT NULL** —— 实施前需 grep `db/schema.ts` 中 `studioInterviewSchedule.scheduledAt` 字段定义确认。若 nullable，默认值改为 `null`（语义为「未排期」）更准确。

## 5. 数据流

```
用户选 PDF
  → useResumeAnalysisPipeline.handleResumeChange
      → POST /api/interview/parse-resume (NDJSON stream)
         → onProfileParsed → 表单四个字段回填
      → rpc.api.interview['match-job-description'].$post
         → onJobDescriptionMatched → jobDescriptionId 回填
      → fetchInterviewDedup
         → 命中 → setDedupMatches → ResumeAnalysisOverlay 渲染 ResumeDedupOverlay
                  → 用户点"继续录入"
                     → runQuestionGeneration → onQuestionsGenerated → resumePayload 更新
         → 未命中 → 直接 runQuestionGeneration → onQuestionsGenerated

分支 A — 用户点"保存"
  → buildFormData (含 resumePayload from hook state, 不含 scheduleEntries)
  → POST /api/w/:slug/studio/resumes
      → 服务端读 resumePayload → interviewQuestions 一并写入
  → onCreated({ mode: "save-only", detail }) → toast「简历记录已创建」→ 关弹窗

分支 B — 用户点"保存并发起面试"
  → buildFormData (含 resumePayload + scheduleEntries=[DEFAULT_SCHEDULE_ENTRY] + status="ready")
  → POST /api/w/:slug/studio/interviews
      → 现有 handler 走完整事务（record + schedule rows + autoBindApplicableTemplates）
  → onCreated({ mode: "save-and-start", record }) → toast「已创建并发起 1 轮面试」→ 关弹窗
```

## 6. 错误处理 / 边界情况

| 场景                                  | 行为                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 简历解析流失败                        | 沿用 hook 内 toast，文件被回滚为 null；用户可手动录入表单后直接 POST（与现状对齐：服务端兜底跑 `parseResumeFastToProfile`，questions 留空） |
| JD 自动匹配失败                       | 静默吞，用户可手动选 JD（沿用 AI 面试现有行为）                                                                                             |
| dedup 检查失败                        | toast.warning「身份查重失败，已跳过」，继续 Step 2（与 AI 面试一致）                                                                        |
| 题目生成失败                          | toast 错误，`resumePayload.interviewQuestions = []`，用户仍可"保存"将记录入库（questions 字段为空）                                         |
| 用户中途取消 (`handleCancelAnalysis`) | abort 所有 in-flight 请求，清空 file/payload/dedup state，表单原值保留                                                                      |
| 用户不上传 PDF                        | hook 不启动；两个按钮都可点                                                                                                                 |
| 用户上传 PDF 后改文件                 | `handleResumeChange` 在开头 reset 所有相关 state；hook 内部行为不变                                                                         |
| 用户不上传 PDF 直接「保存并发起面试」 | 允许 —— 默认 schedule 仍写入；候选人姓名走表单值（不会被 profile 兜底）；与 AI 面试现有「手动录入 + 不上传简历」路径一致                    |
| 「保存并发起面试」POST 失败           | toast 错误，弹窗不关，按钮恢复可点（用户可重试「保存」降级或重新「保存并发起面试」）                                                        |

## 7. Testing

### 7.1 Hook 单测 (`src/app/(auth)/w/[slug]/studio/_components/__tests__/use-resume-analysis-pipeline.test.ts`)

Vitest + jsdom，mock `fetch`、`rpc`、`fetchInterviewDedup`、`readNdjsonStream`：

- Step 1 成功 → `onProfileParsed` 被调用，`resumePayload` 含 profile
- Step 1 成功 + JD match 命中 → `onJobDescriptionMatched` 被调用
- dedup 命中 → `dedupMatches` 非 null，Step 2 不自动跑
- `handleDedupContinue` → 继续 Step 2
- Step 2 成功 → `onQuestionsGenerated` 被调用，`resumePayload.interviewQuestions` 填充
- `handleCancelAnalysis` → abort 后续不再触发回调
- Step 1 失败 → 不进 Step 2

### 7.2 后端测试

#### 简历库 POST (`src/server/routes/studio/routes/resumes/__tests__/route.create-with-payload.test.ts`)

- POST 带 `resumePayload` → 记录的 `interviewQuestions` 与 payload 一致
- POST 不带 `resumePayload` 但带 PDF → 走 `parseResumeFastToProfile`，`interviewQuestions` 为 `[]`
- POST 不带 `resumePayload` 也不带 PDF → 行为同现状
- payload JSON 非法 → 400

#### AI 面试 POST 回归 (`src/server/routes/studio/routes/interviews/__tests__/`)

复用现有 POST tests，确认接受简历库前端传来的同样 payload 形状（`resumePayload` + `scheduleEntries=[default]`）能成功写入 record + schedule row 1 条。

### 7.3 前端端到端手动验收

**简历库分支 A — 仅保存**：

- 列表点「新建简历记录」→ 选 PDF → 看到流式进度 → 表单自动填好
- 点「保存」→ toast「简历记录已创建」→ 列表新行
- 打开详情，切到「AI 题目」tab 看到生成的题

**简历库分支 B — 保存并发起面试**：

- 同上至 hook 完成
- 点「保存并发起面试」→ toast「已创建并发起 1 轮面试」→ 列表新行
- 进 `/studio/interviews` 也能看到该记录，详情有 1 条 schedule 行（初轮，scheduledAt=刚才）

**AI 面试回归**：

- AI 面试侧点「新建面试记录」走完整流程，确认行为不变

**质量门**：`pnpm typecheck` / `pnpm check` / `pnpm test` 全部通过

## 8. Migration & rollout

- 单 PR 合入
- 无 DB migration
- AI 面试侧因重构有回归风险，要保证 CreateInterviewDialog 现有手动验收路径全部通过

## 9. Risks

- **风险**：`useResumeAnalysisPipeline` 抽得太薄，反而让 `CreateInterviewDialog` 难懂。
  **对策**：hook 接口只暴露三个 callback + state + reset；hook 内部维持现有结构，函数大小不变；review 时优先看接口边界。

- **风险**：`fetchInterviewDedup` 与 `fetchResumeDedup` 行为细微差异（虽然底层 DAO 相同）。
  **对策**：实现时 grep 两个 helper 的使用方，确认 `queryInterviewDedup` 一致；保留两套路由不删，避免影响其他位置。

- **风险**：详情对话框 resume 模式新加 "AI 题目" tab，旧 `ResumeLibraryDetail` DTO 不含 interviewQuestions → 客户端 cache 命中老数据时 tab 空。
  **对策**：服务端字段直接补上；列表行 DTO 保持精简；细节弹窗每次重新 fetch，cache 失效靠 `invalidateStudioInterviewCaches`，无额外动作。

## 10. Open items

- §4 列表中的 3 个文案 / UX 决策（跳转、默认 scheduledAt、schedule 字段可空性）。
- 是否需要把简历库 dedup-check 路由 `/api/w/:slug/studio/resumes/dedup-check` 标 deprecated？—— 不在本次 spec 范围，保留。
- AI 面试新建中「取消分析」UX 与简历库是否完全一致？—— 是。
