import type {
  GeneratedInterviewQuestion,
  ResumeAnalysisResult,
  ResumeProfile,
} from "@arc/db-schema/interview/types";
import { stepCountIs } from "ai";
import { uniq } from "lodash-es";
import { z } from "zod";
import { generatedInterviewQuestionsSchema } from "@arc/db-schema/interview/types";
import {
  generateResumeStructured,
  parseResumeFast,
} from "@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-pipeline";
import {
  getResumeDocumentExtension,
  isSupportedResumeDocumentInput,
  supportedResumeDocumentLabel,
} from "@arc/shared/resume-documents";
import { isResumeParseCacheEnabled } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-cache-policy";
import type { ResumeTextSource } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-pipeline";
import {
  buildAttachmentKeyByHash,
  putObjectBytes,
} from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import { getRequiredEnv } from "@arc/ai-recruitment-copilot-backend/lib/server/env";
import { sha256HexOfBytes } from "@arc/shared/file-hash";
import {
  createAttachment,
  findAttachmentByContentHash,
  updateStructuredByHash,
} from "@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat-attachments";
import { parseJsonOutput } from "./json-output";
import { createResumeAgent } from "./resume-agent";
import {
  projectAttachmentToResumeProfile,
  structuredSchema,
  toResumeProfile,
} from "./resume-parser-agent";
import type { ResumeParserStructured } from "./resume-parser-agent";

import type { AnalysisStreamEvent } from "@arc/shared/api-stream";
import type { ResumeReview } from "@arc/shared/resume-review";
import {
  RESUME_REVIEW_DIMENSIONS,
  RESUME_REVIEW_SCHEMA_VERSION,
  computeResumeReviewBaseScore,
  formatResumeReviewMarkdown,
  formatResumeReviewFrameworkWeights,
  resumeReviewActionSchema,
  resumeReviewBiasItemSchema,
  resumeReviewDimensionSchema,
  resumeReviewPointSchema,
} from "@arc/shared/resume-review";

export type { AnalysisStreamEvent };

const PARSE_STAGE_LABELS = {
  ocr: "OCR 识别简历",
  structured: "提取结构化字段",
} as const;
const NDJSON_HEARTBEAT_INTERVAL_MS = 10_000;

function createNdjsonStream(
  run: (emit: (event: AnalysisStreamEvent) => void) => Promise<void>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (event: AnalysisStreamEvent) => {
        if (closed) {
          return;
        }
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const heartbeat = setInterval(() => {
        emit({ timestamp: Date.now(), type: "heartbeat" });
      }, NDJSON_HEARTBEAT_INTERVAL_MS);
      try {
        await run(emit);
      } catch (error) {
        emit({
          message: error instanceof Error ? error.message : "Unknown error",
          type: "error",
        });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        controller.close();
      }
    },
  });
}

const MAX_RESUME_FILE_SIZE = 20 * 1024 * 1024;

export class ResumeAnalysisError extends Error {
  stage: "resume-parsing" | "question-generation";
  resumeProfile?: ResumeProfile;

  constructor(
    message: string,
    stage: "resume-parsing" | "question-generation",
    resumeProfile?: ResumeProfile,
  ) {
    super(message);
    this.name = "ResumeAnalysisError";
    this.stage = stage;
    this.resumeProfile = resumeProfile;
  }
}

function uniqueStrings(values: string[]) {
  return uniq(values.map((value) => value.trim()).filter(Boolean));
}

function trimToNull(value: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function normalizeNumber(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeEducationExperiences(
  experiences: NonNullable<ResumeProfile["educationExperiences"]> | undefined,
): NonNullable<ResumeProfile["educationExperiences"]> {
  return (experiences ?? []).map((education) => ({
    degree: trimToNull(education.degree),
    educationLevel: trimToNull(education.educationLevel),
    graduationYear: trimToNull(education.graduationYear),
    major: trimToNull(education.major),
    period: trimToNull(education.period),
    school: trimToNull(education.school),
    summary: trimToNull(education.summary),
  }));
}

export function normalizeResumeProfile(profile: ResumeProfile): ResumeProfile {
  return {
    age: normalizeNumber(profile.age),
    educationExperiences: normalizeEducationExperiences(profile.educationExperiences),
    email: trimToNull(profile.email),
    gender: trimToNull(profile.gender),
    name: profile.name.trim() || "未发现信息",
    personalStrengths: uniqueStrings(profile.personalStrengths),
    phone: trimToNull(profile.phone),
    projectExperiences: profile.projectExperiences.map((experience) => ({
      name: trimToNull(experience.name),
      period: trimToNull(experience.period),
      role: trimToNull(experience.role),
      summary: trimToNull(experience.summary),
      techStack: uniqueStrings(experience.techStack),
    })),
    schools: uniqueStrings(profile.schools),
    skills: uniqueStrings(profile.skills),
    targetRoles: uniqueStrings(profile.targetRoles),
    workExperiences: profile.workExperiences.map((experience) => ({
      company: trimToNull(experience.company),
      period: trimToNull(experience.period),
      role: trimToNull(experience.role),
      summary: trimToNull(experience.summary),
    })),
    workYears: normalizeNumber(profile.workYears),
  };
}

function normalizeInterviewQuestions(questions: GeneratedInterviewQuestion[]) {
  return questions.map((question, index) => ({
    difficulty: question.difficulty,
    order: index + 1,
    question: question.question.trim(),
  }));
}

// `parseJsonOutput` is re-exported from json-output below for backward compat.
export { parseJsonOutput } from "./json-output";

export function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function isSupportedResumeDocumentFile(file: File) {
  return isSupportedResumeDocumentInput({ fileName: file.name, mediaType: file.type });
}

function validateResumeDocumentInput(input: {
  fileName: string;
  mediaType?: string;
  size: number;
}) {
  if (!isSupportedResumeDocumentInput(input)) {
    throw new Error(`仅支持上传 ${supportedResumeDocumentLabel} 简历。`);
  }

  if (input.size > MAX_RESUME_FILE_SIZE) {
    throw new Error("简历文件不能超过 20 MB。");
  }
}

export function validateResumeFile(file: File) {
  validateResumeDocumentInput({
    fileName: file.name,
    mediaType: file.type,
    size: file.size,
  });
}

const QUESTION_INSTRUCTIONS = `你是一名技术面试出题助手。请基于给定的候选人简历结构化信息，生成 10 道面试题。

## 输出 JSON 结构（必须严格遵守）

{
  "interviewQuestions": [
    { "difficulty": "easy" | "medium" | "hard", "question": string }
  ]
}

注意：顶层字段名必须是 "interviewQuestions"，不要用其他名称。数组必须恰好包含 10 项。

## 出题规则
1. 题目必须与候选人的 targetRoles 高度相关；如果 targetRoles 有多个，优先围绕最核心、最明确的岗位方向出题。
2. 如果 targetRoles 为空，则根据 skills、workExperiences、projectExperiences 推断最可能的岗位方向出题；字符串值为"未发现信息"时视为未知信息，不要围绕它出题。
3. 题目必须由简入深：
   - 第 1-3 题为 easy，聚焦背景了解、经历澄清、基础能力验证。
   - 第 4-7 题为 medium，聚焦项目细节、技术选型、实现思路、问题排查。
   - 第 8-10 题为 hard，聚焦复杂场景、权衡取舍、系统设计、难点复盘。
4. 优先围绕简历中真实出现过的项目经历、工作经历、技能栈来提问，不要输出泛泛而谈的空洞题目。
5. 题目语言以候选人的主要语言为主：根据简历、目标岗位和岗位说明中占主导的语言判断；如果无法判断，默认使用中文。
6. 不要给答案，不要输出解释，不要重复题目。`;

export interface ResumeParseResult {
  fileName: string;
  resumeProfile: ResumeProfile;
  resumeText: string | null;
}

export interface StreamParseResumeContext {
  /**
   * 当前会话的 userId / activeOrganizationId。提供这两个值才会在 cache miss
   * 时把解析结果回写 chat_attachment 注册表 + S3，否则只返回解析结果不落表。
   * Provide both to populate the chat_attachment registry + S3 on cache miss;
   * omit to keep this endpoint side-effect-free.
   */
  userId: string;
  organizationId: string | null;
}

/**
 * 在 parseResumeFast 成功后把解析结果回写 chat_attachment + S3，使后续
 * /chat/uploads 与 storeInterviewResume 在同一份 PDF 上都能命中 hash cache。
 * 任何失败都吞掉只 log —— /parse-resume 的本职是把 profile 还给客户端，缓存
 * 写入是顺手副作用，不应让它阻塞主流程。
 *
 * Persist the parse result into chat_attachment + S3 after a successful
 * parseResumeFast so subsequent chat uploads / studio saves hit the hash
 * cache. Failures are swallowed and logged — populating the cache is a
 * best-effort side effect of /parse-resume and must not block the response.
 */
async function persistParseToRegistry(args: {
  bytes: Uint8Array;
  contentHash: string;
  file: File;
  context: StreamParseResumeContext;
  parsed: {
    pageCount: number;
    structured: ResumeParserStructured;
    text: string;
    textSource: ResumeTextSource;
  };
}): Promise<void> {
  if (!args.context.organizationId) {
    return;
  }
  try {
    const storageKey = await buildAttachmentKeyByHash(
      args.contentHash,
      getResumeDocumentExtension({
        fileName: args.file.name,
        mediaType: args.file.type,
      }),
    );
    // 顺序而非并行：S3 PUT 失败时不写 DB，避免注册表里出现指向不存在 key 的行。
    // Sequential (not Promise.all) so a failed S3 PUT skips the DB insert and
    // we never leave a registry row pointing at a missing storage key.
    await putObjectBytes({
      body: args.bytes,
      contentType: args.file.type || "application/octet-stream",
      storageKey,
    });
    await createAttachment({
      contentHash: args.contentHash,
      filename: args.file.name.slice(0, 255) || "resume",
      id: crypto.randomUUID(),
      mediaType: args.file.type || "application/octet-stream",
      organizationId: args.context.organizationId,
      parsedAt: new Date(),
      parsedPageCount: args.parsed.pageCount,
      parsedStatus: "ready",
      parsedStructured: args.parsed.structured,
      parsedText: args.parsed.text,
      parsedTextSource: args.parsed.textSource,
      size: args.bytes.byteLength,
      storageKey,
      userId: args.context.userId,
    });
  } catch (error) {
    console.error("[parse-resume] failed to populate chat_attachment cache", error);
  }
}

/**
 * Stage 1: Parse a PDF resume and extract structured profile information.
 *
 * This is the NDJSON stream wrapper around the shared resume-parser subagent.
 * It drives `buildResumeParserAgent`, pipes the stream through as
 * AnalysisStreamEvent progress events, then validates the final JSON against
 * the subagent's superset schema and projects it down to `ResumeProfile` via
 * `toResumeProfile`.
 *
 * When `context` is supplied, the parse result is also persisted into the
 * shared chat_attachment registry on a cache miss so that later studio saves
 * and chat uploads of the same file hit the hash cache instead of re-parsing.
 */
export function streamParseResumeProfile(
  file: File,
  context?: StreamParseResumeContext,
): ReadableStream<Uint8Array> {
  validateResumeFile(file);

  return createNdjsonStream(async (emit) => {
    emit({ message: "正在解析简历文件…", type: "status" });

    const bytes = new Uint8Array(await file.arrayBuffer());

    // 命中注册表：三种情况按"能省多少跳过多少"的顺序处理。
    //   A. 已有结构化 → OCR + 结构化两步全跳过。
    //   B. 仅有 OCR 文本（chat 上传后未结构化）→ 只跑结构化一步，并回填同 hash 所有行。
    //   C. 都没有 → 落到完整 parseResumeFast。
    // Registry hit, three cases ordered by "skip as much as possible":
    //   A. structured already cached → skip both OCR and structured stages.
    //   B. only OCR text cached (chat upload path, no structured yet) → run
    //      structured extraction alone, then backfill all rows sharing the hash.
    //   C. nothing usable → fall through to the full parseResumeFast.
    const contentHash = await sha256HexOfBytes(bytes);
    const existing = isResumeParseCacheEnabled()
      ? await findAttachmentByContentHash(contentHash)
      : null;
    if (existing?.parsedStructured) {
      const cached = projectAttachmentToResumeProfile(existing.parsedStructured);
      if (cached) {
        emit({ message: "命中已有简历缓存，跳过解析。", type: "status" });
        emit({
          data: {
            fileName: file.name,
            resumeProfile: cached,
            resumeText: existing.parsedText ?? null,
          },
          type: "result",
        });
        return;
      }
    }
    if (existing?.parsedText && existing.parsedText.trim().length > 0) {
      emit({ message: "命中 OCR 缓存，仅跑结构化…", type: "status" });
      emit({ index: 2, type: "step" });
      emit({ name: PARSE_STAGE_LABELS.structured, type: "tool-start" });

      const structured = await generateResumeStructured(existing.parsedText);
      await updateStructuredByHash(contentHash, structured);

      emit({ name: PARSE_STAGE_LABELS.structured, type: "tool-end" });
      emit({
        data: {
          fileName: file.name,
          resumeProfile: normalizeResumeProfile(toResumeProfile(structured)),
          resumeText: existing.parsedText,
        },
        type: "result",
      });
      return;
    }

    emit({ index: 1, type: "step" });
    emit({ name: PARSE_STAGE_LABELS.ocr, type: "tool-start" });

    const fast = await parseResumeFast({
      bytes,
      fileName: file.name,
      mediaType: file.type,
    });

    emit({ name: PARSE_STAGE_LABELS.ocr, type: "tool-end" });

    emit({ index: 2, type: "step" });
    emit({ name: PARSE_STAGE_LABELS.structured, type: "tool-start" });
    emit({ name: PARSE_STAGE_LABELS.structured, type: "tool-end" });

    if (context) {
      await persistParseToRegistry({ bytes, contentHash, context, file, parsed: fast });
    }

    const result: ResumeParseResult = {
      fileName: file.name,
      resumeProfile: normalizeResumeProfile(toResumeProfile(fast.structured)),
      resumeText: fast.text,
    };

    emit({ data: result, type: "result" });
  });
}

/**
 * Stage 2: Generate interview questions from an already-parsed resume profile.
 * Returns a NDJSON stream with progress events and final result.
 */
export function streamGenerateInterviewQuestions(
  resumeProfile: ResumeProfile,
): ReadableStream<Uint8Array> {
  return createNdjsonStream(async (emit) => {
    emit({ message: "正在生成面试题…", type: "status" });

    const structuredModelId = getRequiredEnv("ALIBABA_STRUCTURED_MODEL");

    const questionAgent = createResumeAgent({
      enableThinking: false,
      instructions: QUESTION_INSTRUCTIONS,
      modelId: structuredModelId,
      stopWhen: stepCountIs(2),
      temperature: 0.3,
      tools: {},
    });

    const streamResult = await questionAgent.stream({
      prompt: `候选人信息：\n${JSON.stringify(resumeProfile, null, 2)}`,
    });

    let stepIndex = 0;
    let fullText = "";
    for await (const part of streamResult.stream) {
      if (part.type === "text-delta") {
        fullText += part.text;
      } else if (part.type === "start-step") {
        stepIndex += 1;
        emit({ index: stepIndex, type: "step" });
      }
    }

    const parsed = parseJsonOutput(
      fullText,
      generatedInterviewQuestionsSchema,
      "question-generation",
    );
    emit({
      data: { interviewQuestions: normalizeInterviewQuestions(parsed.interviewQuestions) },
      type: "result",
    });
  });
}

// =====================================================================
// Stage helpers — 把原 analyzeResumeFile 拆成两段独立可调用：
//   parseResumeFastToProfile —— 字节 → ResumeProfile + 原始 superset
//   generateInterviewQuestionsForProfile —— ResumeProfile → 面试题
// 这样 studio 路由在拿到 cache 命中的 profile 时，只用跑 question-gen。
// Stage helpers split out from analyzeResumeFile so the studio route
// can skip parseResumeFast when it already has a cached resume profile.
// =====================================================================

export interface ParsedResumeProfileResult {
  resumeProfile: ResumeProfile;
  parsedStructured: ResumeParserStructured;
  parsedTextSource: ResumeTextSource;
  parsedPageCount: number;
  parsedText: string;
}

export async function parseResumeBytesToProfile(input: {
  bytes: Uint8Array;
  fileName: string;
  mediaType?: string;
}): Promise<ParsedResumeProfileResult> {
  validateResumeDocumentInput({
    fileName: input.fileName,
    mediaType: input.mediaType,
    size: input.bytes.byteLength,
  });
  try {
    const fast = await parseResumeFast({
      bytes: input.bytes,
      fileName: input.fileName,
      mediaType: input.mediaType,
    });
    return {
      parsedPageCount: fast.pageCount,
      parsedStructured: fast.structured,
      parsedText: fast.text,
      parsedTextSource: fast.textSource,
      resumeProfile: normalizeResumeProfile(toResumeProfile(fast.structured)),
    };
  } catch (error) {
    if (error instanceof ResumeAnalysisError) {
      throw error;
    }
    throw new ResumeAnalysisError(
      error instanceof Error ? error.message : "Failed to extract resume information.",
      "resume-parsing",
    );
  }
}

export async function parseResumeFastToProfile(file: File): Promise<ParsedResumeProfileResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return parseResumeBytesToProfile({
    bytes,
    fileName: file.name,
    mediaType: file.type,
  });
}

export async function generateInterviewQuestionsForProfile(
  resumeProfile: ResumeProfile,
): Promise<ResumeAnalysisResult["interviewQuestions"]> {
  try {
    const structuredModelId = getRequiredEnv("ALIBABA_STRUCTURED_MODEL");
    const questionAgent = createResumeAgent({
      enableThinking: false,
      instructions: QUESTION_INSTRUCTIONS,
      modelId: structuredModelId,
      stopWhen: stepCountIs(2),
      temperature: 0.3,
      tools: {},
    });

    const { text } = await questionAgent.generate({
      prompt: `候选人信息：\n${JSON.stringify(resumeProfile, null, 2)}`,
    });

    const parsed = parseJsonOutput(text, generatedInterviewQuestionsSchema, "question-generation");
    return normalizeInterviewQuestions(parsed.interviewQuestions);
  } catch (error) {
    if (error instanceof ResumeAnalysisError) {
      throw error;
    }
    throw new ResumeAnalysisError(
      error instanceof Error ? error.message : "Failed to generate interview questions.",
      "question-generation",
      resumeProfile,
    );
  }
}

// =====================================================================
// Stage 3: Resume review generation (three-agent pipeline)
//
// Agent 0 (hard filter):  从 JD 文本提取结构化硬性门槛 → 代码规则引擎匹配简历。
//                          命中任一非 null 门槛且不满足 → 短路淘汰，跳过 Agent 1/2。
// Agent 1 (qualitative):  生成结论 / 亮点 / 风险 / 偏差 / 团队定位 / 职级 / 下一步建议。
// Agent 2 (scoring):      基于简历 + JD + Agent 1 输出，按产品六维框架打分。
// 组装层:                  把 Agent 1 定性结果 + Agent 2 维度分 + 代码计算的 baseScore 合并成 ResumeReview。
//
// baseScore 由代码按共享框架权重加权得出，LLM 不输出总分，保证子分与总分自洽。
// 历史面试加权（架构图 Stage 3）暂未接入，数据源到位后由调用方在 baseScore 之上叠加。
// =====================================================================

const nonEmpty = z.string().trim().min(1);
const RESUME_REVIEW_SERVER_TIME_ZONE = "Asia/Shanghai";

function buildResumeReviewTimeContext(now = new Date()) {
  const formattedNow = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: RESUME_REVIEW_SERVER_TIME_ZONE,
  }).format(now);

  return [
    `当前服务端时间（${RESUME_REVIEW_SERVER_TIME_ZONE}）：${formattedNow}`,
    "时间判断规则：判断候选人的在职时长、工作年限、项目持续时间、是否仍在职、时间线是否合理时，以上述服务端时间作为“现在”；简历中的“至今”“最近”“目前”默认按该时间理解。不要使用模型训练时间或系统外部假设代替当前时间。",
  ].join("\n");
}

// ---------------------------------------------------------------------
// Agent 0: 硬性门槛提取 + 规则引擎
// ---------------------------------------------------------------------

const HARD_FILTER_INSTRUCTIONS = `你是一名招聘门槛提取助手。从给定的在招岗位描述（JD）中，提取结构化硬性门槛。
只提取 JD 中明确写出的硬性要求（如"必须本科以上""3 年以上经验""必须掌握 React"）；JD 未提及的字段输出 null，表示不参与过滤。
不要编造 JD 中没有的要求。不要输出解释性文字，只输出 JSON 对象。

## 输出 JSON 结构
{
  "minimumEducation": "专科" | "本科" | "硕士" | "博士" | null,
  "minimumWorkYears": 数字 | null,
  "requiredSkills": ["技能名"] | null,
  "semanticRequirements": ["JD 中无法用规则匹配的语义要求，如'有从零到一建设经验''有大团队管理经验'"] | null
}

## 说明
- minimumEducation：只填 JD 明确写的最低学历要求；未提及则 null。
- minimumWorkYears：JD 写的最低工作年限数字；未提及则 null。
- requiredSkills：JD 明确标注"必须掌握""必备""精通"的技能；建议性技能不算。
- semanticRequirements：JD 中定性描述的硬性要求（无法用学历/年限/技能关键词匹配的），交给下游定性评价 Agent 在偏差扫描中覆盖。JD 无此类要求则输出空数组或 null。
- 不要输出 workLocation / languageRequirements / requiredCertifications 字段——当前简历结构化数据不支持这些维度的规则匹配。`;

const EDUCATION_LEVEL_ORDER = ["专科", "大专", "本科", "硕士", "博士"] as const;

function educationLevelRank(level: string | null | undefined): number {
  if (!level) {
    return -1;
  }
  const trimmed = level.trim();
  const idx = EDUCATION_LEVEL_ORDER.findIndex(
    (entry) => trimmed === entry || trimmed.includes(entry),
  );
  return idx === -1 ? -1 : idx;
}

const hardFilterSchema = z.object({
  minimumEducation: z.enum(["专科", "大专", "本科", "硕士", "博士"]).nullable(),
  minimumWorkYears: z.number().int().min(0).nullable(),
  requiredSkills: z.array(nonEmpty).nullable(),
  semanticRequirements: z.array(nonEmpty).nullable(),
});
type HardFilterCriteria = z.infer<typeof hardFilterSchema>;

export interface HardFilterViolation {
  field: string;
  description: string;
  impact: string;
}

function normalizeSkill(s: string): string {
  return s.trim().toLowerCase();
}

// 规则引擎：把简历与硬性门槛逐项比对，返回所有违反项。
// Rule engine: compare resume against hard criteria, return all violations.
function checkHardFilter(
  resumeProfile: ResumeProfile,
  criteria: HardFilterCriteria,
): HardFilterViolation[] {
  const violations: HardFilterViolation[] = [];

  if (criteria.minimumEducation) {
    const requiredRank = educationLevelRank(criteria.minimumEducation);
    const educations = resumeProfile.educationExperiences ?? [];
    const candidateMaxRank = Math.max(
      ...educations.map((edu) => educationLevelRank(edu.educationLevel)),
      -1,
    );
    if (candidateMaxRank >= 0 && candidateMaxRank < requiredRank) {
      violations.push({
        description: `学历不达标：岗位要求${criteria.minimumEducation}及以上`,
        field: "minimumEducation",
        impact: "硬性门槛不满足，建议淘汰",
      });
    }
  }

  if (
    criteria.minimumWorkYears !== null &&
    typeof resumeProfile.workYears === "number" &&
    resumeProfile.workYears < criteria.minimumWorkYears
  ) {
    violations.push({
      description: `经验年限不够：岗位要求${criteria.minimumWorkYears}年以上，候选人${resumeProfile.workYears}年`,
      field: "minimumWorkYears",
      impact: "硬性门槛不满足，建议淘汰",
    });
  }

  if (criteria.requiredSkills && criteria.requiredSkills.length > 0) {
    const candidateSkills = new Set([
      ...resumeProfile.skills.map(normalizeSkill),
      ...resumeProfile.projectExperiences.flatMap((p) => p.techStack.map(normalizeSkill)),
    ]);
    const missing = criteria.requiredSkills.filter(
      (skill) => !candidateSkills.has(normalizeSkill(skill)),
    );
    if (missing.length > 0) {
      violations.push({
        description: `必备技能缺失：${missing.join("、")}`,
        field: "requiredSkills",
        impact: "硬性门槛不满足，建议淘汰",
      });
    }
  }

  return violations;
}

// 硬性门槛不达标时生成的精简 reject review。
// Minimal reject review when hard filter violations are found.
function buildHardFilterRejectReview(
  violations: HardFilterViolation[],
): ResumeReviewGenerationResult {
  const structuredReview: ResumeReview = {
    biasScan: {
      items: violations.map((v) => ({
        category: "hard_gap" as const,
        description: v.description,
        impact: v.impact,
      })),
    },
    dimensions: {
      educationBackground: { rationale: "硬性门槛不达标，未评分", score: 0 },
      experienceRelevance: { rationale: "硬性门槛不达标，未评分", score: 0 },
      potential: { rationale: "硬性门槛不达标，未评分", score: 0 },
      projectMatch: { rationale: "硬性门槛不达标，未评分", score: 0 },
      skillMatch: { rationale: "硬性门槛不达标，未评分", score: 0 },
      stability: { rationale: "硬性门槛不达标，未评分", score: 0 },
    },
    levelRecommendation: {
      level: "—",
      rationale: "未通过硬性门槛过滤",
    },
    nextStep: {
      action: "reject" as const,
      disclaimer: "以上为初步结论",
      interviewFocus: [],
      rationale: `命中 ${violations.length} 项硬性门槛不达标`,
    },
    overall: {
      baseScore: 0,
      conclusion: "候选人未通过硬性门槛过滤。",
      scoreRationale: "硬性门槛不达标，未进入语义评分阶段。",
    },
    schemaVersion: RESUME_REVIEW_SCHEMA_VERSION,
    strengths: [
      {
        evidence: null,
        impact: "未进入定性评价阶段",
        point: "硬性门槛未通过",
      },
    ],
    teamPositioning: {
      rationale: "未通过硬性门槛过滤",
      suggestion: "暂不推荐",
    },
    weaknesses: violations.map((v) => ({
      evidence: null,
      impact: v.impact,
      point: v.description,
    })),
  };
  const review = formatResumeReviewMarkdown(structuredReview).trim().slice(0, 2000);
  return { review, structuredReview };
}

function createHardFilterAgent() {
  const structuredModelId = getRequiredEnv("ALIBABA_STRUCTURED_MODEL");
  return createResumeAgent({
    enableThinking: false,
    instructions: HARD_FILTER_INSTRUCTIONS,
    modelId: structuredModelId,
    stopWhen: stepCountIs(1),
    temperature: 0,
    tools: {},
  });
}

export interface HardFilterResult {
  violations: HardFilterViolation[];
  semanticRequirements: string[] | null;
}

// 运行 Agent 0 提取门槛 + 规则引擎检查。
// JD 为空时跳过提取，返回 null（不过滤）。
// Run Agent 0 extraction + rule engine check.
// Returns null (no filter) when JD is absent.
async function runHardFilter(
  resumeProfile: ResumeProfile,
  jobDescription: string | null | undefined,
): Promise<HardFilterResult | null> {
  if (!jobDescription?.trim()) {
    return null;
  }

  const agent = createHardFilterAgent();
  const { text } = await agent.generate({
    prompt: `${buildResumeReviewTimeContext()}\n\n在招岗位描述：\n${jobDescription.trim()}`,
  });

  const criteria = parseJsonOutput(text, hardFilterSchema, "resume-hard-filter");
  return {
    semanticRequirements: criteria.semanticRequirements,
    violations: checkHardFilter(resumeProfile, criteria),
  };
}

// Agent 1 prompt —— 只输出定性内容，不出现任何 score 字段。
const REVIEW_QUALITATIVE_INSTRUCTIONS = `你是一名招聘评估助手。根据候选人简历和在招岗位（如有），输出一份结构化的定性评价。
本阶段只输出文字结论与归因，不要输出任何分数、等级或数字评分；评分由下游处理。

## 输出要求
- 只输出 JSON 对象，不要输出 Markdown、代码块或解释性文字。
- 所有自由文本字段使用中文，简洁直入，不要寒暄。
- 严格遵守字段名、枚举值和数据类型；无证据时 evidence 填 null，文本写"待核实"。
- 不要编造简历或 JD 中没有的信息。

## 评价内容
1. overall.conclusion：一句话总体判断，描述候选人与岗位的语义匹配方向，不要出现任何数字。
2. strengths（匹配亮点）：1-4 条，每条给出 point + evidence（简历原文证据或 null）+ impact（对岗位匹配的影响）。
3. weaknesses（风险点）：1-4 条，同上结构。
4. biasScan.items（偏差扫描，可为空数组）：
   - 枚举：hard_gap（硬缺口）/ soft_mismatch（软错位）/ credibility_risk（真实性存疑）/ stability_signal（稳定性信号）
   - 每条给出 description + category + impact。
5. teamPositioning：suggestion 给出可执行的团队类型或职责方向，rationale 给出定位依据。
6. levelRecommendation：level 用"初级 / 初中级 / 中级 / 中高级 / 高级 / 资深 / 专家"或 P 级表示，rationale 给出职级依据。
7. nextStep：基于定性判断给出初步建议：
   - action ∈ {interview, hold, reject}
   - rationale：依据（仅基于定性判断，不涉及最终分数）
   - interviewFocus：进入面试或暂缓时建议重点追问的问题，可为空数组
   - disclaimer：必须严格等于"以上为初步结论"

## 输出 JSON 结构（必须严格遵守）
{
  "overall": {
    "conclusion": "一句话总体判断"
  },
  "strengths": [
    { "point": "亮点", "evidence": "简历证据或 null", "impact": "对岗位匹配的影响" }
  ],
  "weaknesses": [
    { "point": "风险点", "evidence": "简历证据或 null", "impact": "对岗位匹配的影响" }
  ],
  "biasScan": {
    "items": [
      {
        "description": "偏差描述",
        "category": "hard_gap" | "soft_mismatch" | "credibility_risk" | "stability_signal",
        "impact": "对岗位胜任的影响"
      }
    ]
  },
  "teamPositioning": {
    "suggestion": "可执行的团队类型或职责方向",
    "rationale": "定位依据"
  },
  "levelRecommendation": {
    "level": "初级 / 初中级 / 中级 / 中高级 / 高级 / 资深 / 专家，或 P 级",
    "rationale": "职级依据"
  },
  "nextStep": {
    "action": "interview" | "hold" | "reject",
    "rationale": "下一步建议依据（仅基于定性判断）",
    "interviewFocus": ["如果进入面试或暂缓，建议重点追问的问题；可为空数组"],
    "disclaimer": "以上为初步结论"
  }
}

## 约束
- strengths 与 weaknesses 各 1-4 条。
- biasScan.items 可为空数组，为空表示未发现关键偏差。
- evidence 只能引用关键证据，禁止复述简历或 JD 全文。
- nextStep.disclaimer 必须严格等于"以上为初步结论"。
- 不要输出 dimensions、overall.score、baseScore、等级标签等任何数字评分字段——这是下游 Agent 的职责。`;

const REVIEW_SCORING_DIMENSION_LIST = RESUME_REVIEW_DIMENSIONS.map(
  (dimension, index) =>
    `${index + 1}. ${dimension.label}（权重 ${Math.round(dimension.weight * 100)}%）：${dimension.checklist.join("；")}。输出 key: ${dimension.key}`,
).join("\n");

const REVIEW_SCORING_JSON_SHAPE = RESUME_REVIEW_DIMENSIONS.map(
  (dimension) =>
    `    "${dimension.key}": { "score": 0-100, "rationale": "${dimension.label}评分依据" }`,
).join(",\n");

// Agent 2 prompt —— 拿简历 + JD + Agent 1 输出，只输出产品六维框架分。
const REVIEW_SCORING_INSTRUCTIONS = `你是一名招聘评分助手。基于已生成的定性评价、候选人简历、在招岗位描述，对简历与岗位的语义匹配度进行六维度打分。
本阶段只输出每维度的分数与依据，不输出总分或综合结论；总分由调用方按权重计算。

## 评分维度与权重（仅供你心中校准，不必输出占比）
${REVIEW_SCORING_DIMENSION_LIST}

## 输出要求
- 每个维度输出 0-100 的整数 score 与一句中文 rationale。
- rationale 要点出"判断依据 + 关键证据"，可引用下游定性评价中的 strengths/weaknesses 或直接引用简历原文；不要泛泛而谈。
- 不要输出 Markdown、代码块或解释性文字；只输出 JSON 对象。
- 不要编造简历或 JD 中没有的信息。

## 与定性评价的一致性
- 若你的打分方向与定性评价的结论、strengths、weaknesses 出现冲突（例如定性说"技术栈高度匹配"，你给技能匹配度打低分），以定性结论方向为准，并在该维度 rationale 开头用"已采纳定性结论"一句说明，再写评分依据。

## 输出 JSON 结构（必须严格遵守）
{
  "dimensions": {
${REVIEW_SCORING_JSON_SHAPE}
  }
}

## 约束
- 顶层只有 dimensions 字段，不要输出 overall / strengths / weaknesses / nextStep 等其他字段。
- 每个 score 是 0-100 的整数，rationale 非空。`;

// Agent 1 定性输出的内部类型 —— 不持久化，只传给 Agent 2 和组装层。
// Internal type for Agent 1 output; not persisted, only fed to Agent 2 + assembler.
const resumeQualitativeSchema = z.object({
  biasScan: z.object({
    items: z.array(resumeReviewBiasItemSchema),
  }),
  levelRecommendation: z.object({
    level: nonEmpty,
    rationale: nonEmpty,
  }),
  nextStep: z.object({
    action: resumeReviewActionSchema,
    disclaimer: z.literal("以上为初步结论"),
    interviewFocus: z.array(nonEmpty),
    rationale: nonEmpty,
  }),
  overall: z.object({
    conclusion: nonEmpty,
  }),
  strengths: z.array(resumeReviewPointSchema).min(1).max(4),
  teamPositioning: z.object({
    rationale: nonEmpty,
    suggestion: nonEmpty,
  }),
  weaknesses: z.array(resumeReviewPointSchema).min(1).max(4),
});
type ResumeQualitativeReview = z.infer<typeof resumeQualitativeSchema>;

// Agent 2 打分输出的内部类型。
const resumeScoringSchema = z.object({
  dimensions: z.object({
    educationBackground: resumeReviewDimensionSchema,
    experienceRelevance: resumeReviewDimensionSchema,
    potential: resumeReviewDimensionSchema,
    projectMatch: resumeReviewDimensionSchema,
    skillMatch: resumeReviewDimensionSchema,
    stability: resumeReviewDimensionSchema,
  }),
});
type ResumeReviewScoring = z.infer<typeof resumeScoringSchema>;

function buildResumeReviewPrompt(input: {
  resumeProfile: ResumeProfile;
  jobDescription?: string | null;
  semanticRequirements?: string[] | null;
}) {
  const jdBlock = input.jobDescription?.trim()
    ? `在招岗位描述：\n${input.jobDescription.trim()}`
    : "在招岗位描述：（未指定 JD，按候选人 targetRoles 推断目标方向进行评估；产品六维评分框架中的岗位匹配判断均以候选人简历的目标岗位方向为参照）";

  const semanticBlock =
    input.semanticRequirements && input.semanticRequirements.length > 0
      ? `\n\nJD 中的语义硬性要求（无法用规则匹配，请在偏差扫描中判断候选人是否满足，不满足时标注为 hard_gap）：\n${input.semanticRequirements.map((req, i) => `${i + 1}. ${req}`).join("\n")}`
      : "";

  return `${buildResumeReviewTimeContext()}\n\n${jdBlock}${semanticBlock}\n\n候选人简历（结构化 JSON）：\n${JSON.stringify(input.resumeProfile, null, 2)}`;
}

function buildResumeScoringPrompt(input: {
  resumeProfile: ResumeProfile;
  jobDescription?: string | null;
  qualitative: ResumeQualitativeReview;
}) {
  const jdBlock = input.jobDescription?.trim()
    ? `在招岗位描述：\n${input.jobDescription.trim()}`
    : "在招岗位描述：（未指定 JD，按候选人 targetRoles 推断目标方向打分）";
  return [
    buildResumeReviewTimeContext(),
    jdBlock,
    `候选人简历（结构化 JSON）：\n${JSON.stringify(input.resumeProfile, null, 2)}`,
    `定性评价（Step 1 输出，已在内容上与岗位比对过，请保持打分方向一致）：\n${JSON.stringify(input.qualitative, null, 2)}`,
  ].join("\n\n");
}

function createResumeReviewQualitativeAgent() {
  const structuredModelId = getRequiredEnv("ALIBABA_STRUCTURED_MODEL");
  return createResumeAgent({
    enableThinking: false,
    instructions: REVIEW_QUALITATIVE_INSTRUCTIONS,
    modelId: structuredModelId,
    stopWhen: stepCountIs(2),
    temperature: 0.4,
    tools: {},
  });
}

function createResumeReviewScoringAgent() {
  const structuredModelId = getRequiredEnv("ALIBABA_STRUCTURED_MODEL");
  return createResumeAgent({
    enableThinking: false,
    instructions: REVIEW_SCORING_INSTRUCTIONS,
    modelId: structuredModelId,
    stopWhen: stepCountIs(2),
    temperature: 0.2,
    tools: {},
  });
}

// 把 Agent 1 定性 + Agent 2 维度分 + 代码算的 baseScore 组装成 ResumeReview。
// Assemble ResumeReview from Agent 1 qualitative + Agent 2 dimensions + code-computed baseScore.
function assembleResumeReview(
  qualitative: ResumeQualitativeReview,
  scoring: ResumeReviewScoring,
): ResumeReview {
  const baseScore = computeResumeReviewBaseScore(scoring.dimensions);
  return {
    biasScan: qualitative.biasScan,
    dimensions: scoring.dimensions,
    levelRecommendation: qualitative.levelRecommendation,
    nextStep: qualitative.nextStep,
    overall: {
      baseScore,
      conclusion: qualitative.overall.conclusion,
      scoreRationale: `基于六维度按 ${formatResumeReviewFrameworkWeights()} 加权得出基础分 ${baseScore}（不含历史面试加权）`,
    },
    schemaVersion: RESUME_REVIEW_SCHEMA_VERSION,
    strengths: qualitative.strengths,
    teamPositioning: qualitative.teamPositioning,
    weaknesses: qualitative.weaknesses,
  };
}

export interface ResumeReviewGenerationResult {
  review: string;
  structuredReview: ResumeReview;
}

function parseStructuredResumeReview(
  qualitative: ResumeQualitativeReview,
  scoringText: string,
): ResumeReviewGenerationResult {
  const scoring = parseJsonOutput(scoringText, resumeScoringSchema, "resume-review-scoring");
  const structuredReview = assembleResumeReview(qualitative, scoring);
  const review = formatResumeReviewMarkdown(structuredReview).trim().slice(0, 2000);
  return { review, structuredReview };
}

/**
 * Stage 3: stream a resume review via the three-agent pipeline.
 *
 * Agent 0 (hard filter) runs first; if violations are found, a reject review
 * is emitted immediately and Agent 1/2 are skipped. Otherwise Agent 1
 * (qualitative) streams text-delta events, then Agent 2 (scoring) runs as a
 * blocking generate() call.
 */
export function streamGenerateResumeReview(input: {
  resumeProfile: ResumeProfile;
  jobDescription?: string | null;
}): ReadableStream<Uint8Array> {
  return createNdjsonStream(async (emit) => {
    emit({ message: "正在检查硬性门槛…", type: "status" });

    // --- Agent 0: 硬性门槛提取 + 规则引擎 ---
    const hardFilterResult = await runHardFilter(input.resumeProfile, input.jobDescription);
    if (hardFilterResult && hardFilterResult.violations.length > 0) {
      emit({ message: "硬性门槛不达标，已淘汰。", type: "status" });
      const result = buildHardFilterRejectReview(hardFilterResult.violations);
      emit({ text: result.review, type: "text-delta" });
      emit({ data: result, type: "result" });
      return;
    }

    emit({ message: "正在生成简历评价…", type: "status" });

    // --- Agent 1: 定性评价（流式） ---
    // 如果 Agent 0 提取了语义门槛，附在 prompt 里让 Agent 1 在偏差扫描中覆盖。
    // Attach semantic requirements (if extracted by Agent 0) so Agent 1 covers them in biasScan.
    const qualitativeStream = await createResumeReviewQualitativeAgent().stream({
      prompt: buildResumeReviewPrompt({
        ...input,
        semanticRequirements: hardFilterResult?.semanticRequirements ?? null,
      }),
    });

    let stepIndex = 0;
    let qualitativeText = "";
    for await (const part of qualitativeStream.stream) {
      if (part.type === "text-delta") {
        qualitativeText += part.text;
      } else if (part.type === "start-step") {
        stepIndex += 1;
        emit({ index: stepIndex, type: "step" });
      }
    }

    const qualitative = parseJsonOutput(
      qualitativeText,
      resumeQualitativeSchema,
      "resume-review-qualitative",
    );

    emit({ message: "正在生成维度评分…", type: "status" });

    // --- Agent 2: 六维度打分（阻塞） ---
    const scoringResult = await createResumeReviewScoringAgent().generate({
      prompt: buildResumeScoringPrompt({ ...input, qualitative }),
    });

    const result = parseStructuredResumeReview(qualitative, scoringResult.text);
    emit({ text: result.review, type: "text-delta" });
    emit({ data: result, type: "result" });
  });
}

export async function generateResumeReview(input: {
  resumeProfile: ResumeProfile;
  jobDescription?: string | null;
}): Promise<ResumeReviewGenerationResult> {
  // --- Agent 0: 硬性门槛提取 + 规则引擎 ---
  const hardFilterResult = await runHardFilter(input.resumeProfile, input.jobDescription);
  if (hardFilterResult && hardFilterResult.violations.length > 0) {
    return buildHardFilterRejectReview(hardFilterResult.violations);
  }

  // --- Agent 1: 定性评价 ---
  const qualitativeResult = await createResumeReviewQualitativeAgent().generate({
    prompt: buildResumeReviewPrompt({
      ...input,
      semanticRequirements: hardFilterResult?.semanticRequirements ?? null,
    }),
  });
  const qualitative = parseJsonOutput(
    qualitativeResult.text,
    resumeQualitativeSchema,
    "resume-review-qualitative",
  );

  // --- Agent 2: 六维度打分 ---
  const scoringResult = await createResumeReviewScoringAgent().generate({
    prompt: buildResumeScoringPrompt({ ...input, qualitative }),
  });

  return parseStructuredResumeReview(qualitative, scoringResult.text);
}

/**
 * Combined: parse profile + generate questions in one blocking call.
 * Used by endpoints that need the full result at once (create/edit interview
 * fallback path when the client hasn't pre-parsed the resume).
 */
export async function analyzeResumeFile(file: File): Promise<ResumeAnalysisResult> {
  const { parsedText, resumeProfile } = await parseResumeFastToProfile(file);
  const interviewQuestions = await generateInterviewQuestionsForProfile(resumeProfile);
  return { fileName: file.name, interviewQuestions, resumeProfile, resumeText: parsedText };
}

// Re-export the subagent's schema so other modules can validate structured
// JSON from the same source of truth without reaching into the parser module.
export { structuredSchema as resumeParserStructuredSchema };
