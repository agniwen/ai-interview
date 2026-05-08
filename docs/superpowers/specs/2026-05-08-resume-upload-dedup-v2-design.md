# 简历上传跨路径去重 v2: chat_attachment 作为统一注册表

**日期**: 2026-05-08
**作者**: @allen + Claude
**状态**: Draft

## 背景

v1（同日早些时候）实现了**表内**去重——chat_attachment 自查、studio_interview 自查，分别由各自的 hash 列支撑。但**跨路径仍会产生重复 S3 对象**：

- 同一份简历从 chat composer 上传 → `chat-attachments/{hash}.pdf` ✓
- 同一简历从 studio interview 入口（含"一键入库"流）上传 → `studio-resumes/{hash}.pdf` ✗（重复一份）

实际查 `src/server/agents/resume-analysis-agent.ts:267-275`，studio 路径**内部**就是先调用 chat 同款的 `parseResumeFast` 拿到 superset (`ResumeParserStructured`)，再用 `toResumeProfile()` 投影到 subset (`ResumeProfile`)。两条路径在解析层是**完全相同**的字节处理；只是 studio 在 LLM 输入前主动丢了 `links` / 教育 / `contact` 等字段。

因此真正要做的不是"加新解析列"，而是把 `chat_attachment` 升级为跨路径的统一注册表。

## 目标

1. **真正的跨路径 S3 去重**：同一份字节，无论从 chat 还是 studio 入口，最多产生 1 个 S3 对象。
2. **跨路径解析复用**：studio 上传时若 chat_attachment 已经存有 `parsedStructured`（superset），跳过 `parseResumeFast`，直接 `toResumeProfile()` 投影。反向同理（chat 自动受益于 studio 写入的行）。
3. **不新增列**：v1 已建好的 `chat_attachment.contentHash` + `parsedStructured` 完全够用。
4. **不动老数据**：仍按 v1 的"老行 NULL 不动"原则。

## 非目标

- 不修改 `studio_interview.resumeProfile` 列类型（保持 `ResumeProfile` 作为 per-interview 快照）。
- 不动读路径（`GET /api/chat/attachments/:id`、`GET /api/studio/interviews/:id/resume` 不变）。
- 不做 `/api/interview/parse-resume` 的去重（单独的 follow-up）。
- 不删 `studio_interview.resumeContentHash` 列（v1 加的，保留作冗余索引；将来可清理）。
- 不改老 S3 对象（老的 `studio-resumes/{hash}.pdf` 对象保留；新写入统一用 `chat-attachments/{hash}.pdf`）。
- 不缓存 `interviewQuestions`（每次跟当前 JD/template 现算）。

## 架构

`chat_attachment` 升级为"任何 PDF 简历字节的统一注册表"——表名沿用，因为 v1 的字段已经是通用化的（id / userId / filename / mediaType / storageKey / contentHash / parsed\*）。

```
                        ┌───────────────────────────┐
                hash →  │     chat_attachment       │
   ┌──────────────────► │  (registry: hash→storage  │
   │                    │   + parsedStructured)     │
   │                    └─────────────┬─────────────┘
   │                                  │
   ▼                                  ▼
chat upload                    studio upload
- 找/写本表                     - 跨表找/写本表
- 复用 parsedStructured         - 命中：toResumeProfile() 投影 → 跳过 parse
                                - 未命中：跑 parseResumeFast → 写本表 → 投影
```

S3 命名统一：所有 v2 新写入使用 `buildAttachmentKeyByHash(hash, "pdf")` → `chat-attachments/{hash}.pdf`。`studio-resumes/{hash}.pdf` 这条 prefix 仍然能被读取（v1 老行的 `resumeStorageKey` 指向那里），只是不再产生新对象。

`studio_interview` 表的简历相关字段保持不变（`resumeStorageKey`、`resumeContentHash`、`resumeFileName`、`resumeProfile`），但语义上这些是 **denormalized 快照**：写入时由 `storeInterviewResume` 提供值。读路径继续按这些列工作，不依赖 chat_attachment。

## 关键决策

- **chat_attachment.parsedStructured 始终存 superset (`ResumeParserStructured`)**。studio 调用方在边界处用纯函数 `toResumeProfile()` 投影到 subset。零成本投影。
- **写者归属**：studio 路径 PUT + 写 chat_attachment 行时，`userId` 设为 `c.var.user.id`（创建面试的 HR）。语义合理——这位 HR 是首次让这份字节入库的操作者。
- **interviewQuestions 不缓存**：每次跟随当前 JD/template 现算，避免缓存不一致。命中缓存只省 `parseResumeFast`，不省 LLM 题目生成。
- **`analyzeResumeFile` 拆分**：把现有的一体化 `analyzeResumeFile(file)` 拆为两步——
  - `parseResumeFastToProfile(file)` —— parse + 投影到 ResumeProfile，**同时**返回原始 superset 供缓存写回；
  - `generateInterviewQuestionsForProfile(profile)` —— 仅 LLM 生成问题。

  `analyzeResumeFile` 保留为组合调用（向后兼容；fallback 路径仍可用）。

- **chat 路径无变化**：现有逻辑（`findAttachmentByContentHash` → 命中复用 + 跳过 PUT/parse；未命中跑 parseResumeFast + PUT + 写行）已经覆盖了"chat_attachment 行可能由 studio 写入"的情况——studio 写入的行同样填好了 `storageKey` + `parsedStructured`。
- **userId 可能跨主体**：studio 写入的 chat_attachment 行 `userId = HR`。如果同一 HR 之后又在 chat composer 拖入同一 PDF，命中复用是完全合规的（同一用户）。如果是另一 HR 在 chat 上传，会创建一条**新的** chat_attachment 行（per-upload 模型不变），仍然复用 `storageKey` + 复制 `parsedStructured`。读权限始终按 `chat_attachment.userId + id` 校验，不变。

## Schema 变更

**无**。

## 流程

### 新增工具：`projectAttachmentToResumeProfile`（位置：`src/server/agents/resume-parser-agent.ts` 内追加，与 `toResumeProfile` 同文件）

```ts
// 把 chat_attachment 行的 superset parsedStructured 投影到 ResumeProfile，
// 调用方据此判断是否能跳过 parseResumeFast。
// Project a chat_attachment row's superset parsedStructured down to ResumeProfile.
// Callers use this to decide whether they can skip parseResumeFast.
export function projectAttachmentToResumeProfile(parsedStructured: unknown): ResumeProfile | null {
  if (!parsedStructured) return null;
  // 字段缺失或类型不符时静默返回 null —— 让调用方走一遍完整 parse 兜底。
  // Silently return null on shape mismatch — caller falls back to a full parse.
  const parsed = structuredSchema.safeParse(parsedStructured);
  if (!parsed.success) return null;
  return normalizeResumeProfile(toResumeProfile(parsed.data));
}
```

`structuredSchema` 已经在 `resume-parser-agent.ts` 导出，`normalizeResumeProfile` 见 `resume-analysis-agent.ts`——可能需要从其文件 export 或 inline 简化版。

### `analyzeResumeFile` 拆分（`src/server/agents/resume-analysis-agent.ts`）

```ts
export interface ParsedResumeProfileResult {
  resumeProfile: ResumeProfile; // 投影后的 subset，调用方使用
  parsedStructured: ResumeParserStructured; // 原始 superset，用于写 chat_attachment 缓存
  parsedTextSource: "qwen-ocr";
  parsedPageCount: number;
}

export async function parseResumeFastToProfile(file: File): Promise<ParsedResumeProfileResult> {
  validateResumeFile(file);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fast = await parseResumeFast(bytes);
    return {
      parsedPageCount: fast.pageCount,
      parsedStructured: fast.structured,
      parsedTextSource: fast.textSource,
      resumeProfile: normalizeResumeProfile(toResumeProfile(fast.structured)),
    };
  } catch (error) {
    if (error instanceof ResumeAnalysisError) throw error;
    throw new ResumeAnalysisError(
      error instanceof Error ? error.message : "Failed to extract resume information.",
      "resume-parsing",
    );
  }
}

export async function generateInterviewQuestionsForProfile(
  profile: ResumeProfile,
): Promise<InterviewQuestion[]> {
  // 把 analyzeResumeFile 第二段（创建 questionAgent + parseJsonOutput）原样搬过来；
  // 错误仍包成 ResumeAnalysisError("question-generation", profile)。
}

// 保留向后兼容
export async function analyzeResumeFile(file: File): Promise<ResumeAnalysisResult> {
  const { resumeProfile } = await parseResumeFastToProfile(file);
  const interviewQuestions = await generateInterviewQuestionsForProfile(resumeProfile);
  return { fileName: file.name, interviewQuestions, resumeProfile };
}
```

### `storeInterviewResume` 改造（`src/server/routes/interview/utils.ts`）

签名扩展：

```ts
export async function storeInterviewResume(
  _interviewRecordId: string,
  file: File,
  userId: string, // ← 新增
): Promise<{
  storageKey: string;
  contentHash: string;
  cachedResumeProfile: ResumeProfile | null; // ← 新增（命中且可投影时填）
} | null>;
```

内部流程：

```
1. bytes = await file.arrayBuffer()
2. hash = sha256HexOfBytes(bytes)
3. existing = findAttachmentByContentHash(hash)   // 已过滤 failed
4. if (existing) {
     return {
       storageKey: existing.storageKey,
       contentHash: hash,
       cachedResumeProfile: projectAttachmentToResumeProfile(existing.parsedStructured),
     };
   }
5. // miss: parse + PUT 并行
   storageKey = buildAttachmentKeyByHash(hash, "pdf")
   [putOutcome, parseOutcome] = Promise.allSettled([
     putObjectBytes({ body: bytes, contentType, storageKey }),
     parseResumeFastToProfile(file),
   ])
6. if (putOutcome.rejected) {
     log + return null    // 与 v1 一致：S3 不可用时静默跳过
   }
7. if (parseOutcome.rejected) {
     // S3 已经写了字节但 parse 失败：不写 chat_attachment 行 (避免污染注册表)。
     // 调用方拿到 cachedResumeProfile = null，会兜底跑 analyzeResumeFile，
     // 那次失败再让上层 ResumeAnalysisError 处理。
     log + return { storageKey, contentHash: hash, cachedResumeProfile: null };
   }
8. // 两步都成功：写 chat_attachment 行
   await createAttachment({
     contentHash: hash,
     filename: file.name.slice(0, 255) || "resume.pdf",
     id: crypto.randomUUID(),
     mediaType: file.type || "application/pdf",
     parsedAt: new Date(),
     parsedPageCount: parseOutcome.value.parsedPageCount,
     parsedStatus: "ready",
     parsedStructured: parseOutcome.value.parsedStructured,
     parsedText: null,           // 无需冗余文字
     parsedTextSource: parseOutcome.value.parsedTextSource,
     size: file.size,
     storageKey,
     userId,
   })
9. return {
     storageKey,
     contentHash: hash,
     cachedResumeProfile: parseOutcome.value.resumeProfile,
   }
```

注意：

- 第 7 步选择"S3 写了但 parse 失败时不写 chat_attachment"——保持注册表只承载可复用的行；S3 那份字节相当于一个"未注册的孤儿对象"，但是同 hash 的下次上传 PUT 是幂等覆盖，无副作用。
- 命名 `parsed_text` 留 NULL：chat 路径会用这个字段做"原文文本"展示，studio 路径不需要；为节省 DB 空间不冗余写入。chat 命中 studio 写入的行时若用到原文文本会缺失——若有这个 case，再补 `parsedText: parseOutcome.value.parsedText`（需要扩展 `ParsedResumeProfileResult`）。

### Studio 创建路由调用点改造（`src/server/routes/interview/route.ts`）

**创建分支**（约 line 668）：

```ts
const uploadResult = resume
  ? await storeInterviewResume(interviewRecordId, resume, c.var.user!.id)
  : null;
const resumeStorageKey = uploadResult?.storageKey ?? null;
const resumeContentHash = uploadResult?.contentHash ?? null;

// 解析复用顺序：客户端预解析 > 缓存命中 > 现场跑完整 analyzeResumeFile
// Reuse order: client-prebaked → server cache hit → server full analysis
let analysis = parsedResumePayload;
if (!analysis && resume) {
  if (uploadResult?.cachedResumeProfile) {
    const interviewQuestions = await generateInterviewQuestionsForProfile(
      uploadResult.cachedResumeProfile,
    );
    analysis = {
      fileName: resume.name,
      interviewQuestions,
      resumeProfile: uploadResult.cachedResumeProfile,
    };
  } else {
    analysis = await analyzeResumeFile(resume);
  }
}
```

**编辑分支**（约 line 942-1010）：

```ts
const uploadResult = resume ? await storeInterviewResume(id, resume, c.var.user!.id) : null;
const resumeStorageKey = uploadResult?.storageKey ?? existing.resumeStorageKey;
const resumeContentHash = resume
  ? (uploadResult?.contentHash ?? existing.resumeContentHash)
  : existing.resumeContentHash;

// 编辑分支不在此处重新分析简历——只更新 storage 引用 (analysis 由 parsedResumePayload 提供或保持原值)。
// Edit path doesn't re-analyze on resume swap; analysis comes from parsedResumePayload or
// remains the prior snapshot.
```

注：编辑分支当前不存在"无 parsedResumePayload 又要新跑分析"的路径，所以编辑分支**只**消费 `uploadResult.storageKey/contentHash`，忽略 `cachedResumeProfile`。

### Chat 路径

**完全不变**。所有现有逻辑兼容 studio 写入的行（因为 studio 写入的行也填了 `parsedStructured`，命中时 chat 自然能复用）。唯一隐含的差异是 chat 命中 studio 写入的行时 `parsedText = null`——如果 chat UI/LLM 调用依赖 parsedText 字段，需要单独处理（当前代码主要用 `parsedStructured`，原文不太关键；先观察）。

## 错误与边界

- **PUT 成功 + parse 失败**：S3 写了字节，无 chat_attachment 行。下次同 hash 上传 PUT 幂等覆盖，再尝试 parse；下次成功后注册行写入。无副作用。
- **PUT 失败**：返回 null。调用方按 v1 现状把 storageKey 设为 null（简历未入库），其他字段照常。
- **现有行的 `parsedStructured` 形状不符**（schema 升级、上游字段变化）：`projectAttachmentToResumeProfile` `safeParse` 失败时返回 null，调用方走完整分析兜底。
- **同 hash 并发 miss**：两个请求并行算 hash → 同时未命中 → 同时 PUT 同一 canonical key（幂等）+ 同时 INSERT 各自的 chat_attachment 行（不同 id）。两条注册行共存；下次查询返回任一行（行为一致）。

## 测试

1. 已有 sha256 / dedup 单测继续通过。
2. 新增（unit）：`projectAttachmentToResumeProfile`——投影正确 + safeParse 失败时返回 null。
3. 新增（unit, mock db）：`storeInterviewResume`：
   - 命中分支：返回 `cachedResumeProfile` 非空，不调 putObjectBytes，不调 parseResumeFastToProfile。
   - 未命中 + parse OK：调 putObjectBytes 一次、parseResumeFastToProfile 一次，写 chat_attachment 行。
   - 未命中 + parse 失败：调 putObjectBytes 一次，**不**写 chat_attachment 行，返回 cachedResumeProfile=null。
4. 新增（unit）：`analyzeResumeFile` 仍然产出原 v1 形状（向后兼容）。

## 实施顺序（高层）

1. 拆 `analyzeResumeFile` → `parseResumeFastToProfile` + `generateInterviewQuestionsForProfile`，保留 `analyzeResumeFile` 组合体。
2. 加 `projectAttachmentToResumeProfile` 工具 + 单测。
3. 改造 `storeInterviewResume` 签名 + cross-table 查询 + 写 chat_attachment 行 + 单测。
4. 改造 studio 创建 + 编辑两个调用点（route.ts），消费新返回。
5. 全量 verify (typecheck + lint + tests + 手工冒烟)。

详细任务拆分由对应 implementation plan 给出。
