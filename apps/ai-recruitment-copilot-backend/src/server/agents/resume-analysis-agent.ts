import type {
  GeneratedInterviewQuestion,
  ResumeAnalysisResult,
  ResumeProfile,
} from "@arc/db-schema/interview/types";
import { stepCountIs } from "ai";
import { uniq } from "lodash-es";
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
import { formatResumeReviewMarkdown, resumeReviewSchema } from "@arc/shared/resume-review";
import type { ResumeReview } from "@arc/shared/resume-review";

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
 * It drives `buildResumeParserAgent`, pipes the fullStream through as
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
        emit({ data: { fileName: file.name, resumeProfile: cached }, type: "result" });
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
    for await (const part of streamResult.fullStream) {
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
// Stage 3: Resume review generation
// =====================================================================

// 评价生成先产出结构化 JSON；notes 由代码用共享 formatter 确定性拼装，
// 这样卡片展示和旧的可编辑文本字段不会互相反解析。
// Generate structured JSON first; notes are deterministically formatted in
// code so card rendering and the legacy editable text field stay decoupled.
const REVIEW_INSTRUCTIONS = `你是一名招聘评估助手，根据候选人简历和在招岗位（如有）输出结构化简历评价。
评价用于"简历库 - 简历评价"字段和卡片展示，必须：
- 只输出 JSON 对象，不要输出 Markdown，不要输出代码块，不要输出解释。
- 所有自由文本字段使用中文，简洁直入，不要寒暄。
- 严格遵守字段名、枚举值和数据类型；无证据时 evidence 填 null，文本里写"待核实"。
- 不要编造简历或 JD 中没有的信息。

## 评价维度权重（用于打分时心中加权，不必输出占比）
- 影响力与结果（30%）：是否有量化业务/产品结果、负责范围与角色、行动-结果式表述。
- 技术深度（25%）：技术栈细节、架构与权衡、性能/稳定性/扩展性工作。
- 岗位相关性（20%）：是否匹配目标岗位关键词、项目与职责相关、内容重点是否支撑。
- 结构与可读性（15%）：表述简洁、时间线一致、层级清晰。
- 信号可信度（10%）：避免夸大、可验证作品、成果有上下文。

## 输出 JSON 结构（必须严格遵守）
{
  "schemaVersion": 1,
  "overall": {
    "conclusion": "一句话总体判断",
    "score": 0-100 的整数,
    "scoreRationale": "总分依据"
  },
  "dimensions": {
    "impactAndResults": { "score": 0-100 的整数, "rationale": "影响力与结果评分依据" },
    "technicalDepth": { "score": 0-100 的整数, "rationale": "技术深度评分依据" },
    "roleRelevance": { "score": 0-100 的整数, "rationale": "岗位相关性评分依据" },
    "structureReadability": { "score": 0-100 的整数, "rationale": "结构与可读性评分依据" },
    "signalCredibility": { "score": 0-100 的整数, "rationale": "信号可信度评分依据" }
  },
  "strengths": [
    { "point": "优点", "evidence": "简历证据或 null", "impact": "对岗位匹配的影响" }
  ],
  "weaknesses": [
    { "point": "缺点", "evidence": "简历证据或 null", "impact": "对岗位匹配的影响" }
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
    "rationale": "下一步建议依据",
    "interviewFocus": ["如果进入面试或暂缓，建议重点追问的问题；可为空数组"],
    "disclaimer": "以上为初步结论"
  }
}

## 约束
- strengths 必须 1-4 条；weaknesses 必须 1-4 条。
- biasScan.items 可以为空数组；为空表示未发现关键偏差。
- evidence 只能引用关键证据，不要复述原始简历或 JD 全文。
- nextStep.disclaimer 必须严格等于"以上为初步结论"。`;

function buildResumeReviewPrompt(input: {
  resumeProfile: ResumeProfile;
  jobDescription?: string | null;
}) {
  const jdBlock = input.jobDescription?.trim()
    ? `在招岗位描述：\n${input.jobDescription.trim()}`
    : "在招岗位描述：（未指定 JD，按候选人 targetRoles 推断目标方向进行评估，岗位相关性维度按候选人简历的目标岗位计分）";

  return `${jdBlock}\n\n候选人简历（结构化 JSON）：\n${JSON.stringify(input.resumeProfile, null, 2)}`;
}

function createResumeReviewAgent() {
  const structuredModelId = getRequiredEnv("ALIBABA_STRUCTURED_MODEL");
  return createResumeAgent({
    enableThinking: false,
    instructions: REVIEW_INSTRUCTIONS,
    modelId: structuredModelId,
    stopWhen: stepCountIs(2),
    temperature: 0.4,
    tools: {},
  });
}

export interface ResumeReviewGenerationResult {
  review: string;
  structuredReview: ResumeReview;
}

function parseStructuredResumeReview(text: string): ResumeReviewGenerationResult {
  const structuredReview = parseJsonOutput(text, resumeReviewSchema, "resume-review-generation");
  const review = formatResumeReviewMarkdown(structuredReview).trim().slice(0, 2000);
  return { review, structuredReview };
}

/**
 * Stage 3: stream a short resume review based on the parsed profile and an
 * optional job-description context. Output is plain Markdown text streamed via
 * text-delta events, then a final `result: { review }`.
 */
export function streamGenerateResumeReview(input: {
  resumeProfile: ResumeProfile;
  jobDescription?: string | null;
}): ReadableStream<Uint8Array> {
  return createNdjsonStream(async (emit) => {
    emit({ message: "正在生成简历评价…", type: "status" });

    const streamResult = await createResumeReviewAgent().stream({
      prompt: buildResumeReviewPrompt(input),
    });

    let stepIndex = 0;
    let fullText = "";
    for await (const part of streamResult.fullStream) {
      if (part.type === "text-delta") {
        fullText += part.text;
      } else if (part.type === "start-step") {
        stepIndex += 1;
        emit({ index: stepIndex, type: "step" });
      }
    }

    const result = parseStructuredResumeReview(fullText);
    emit({ text: result.review, type: "text-delta" });
    emit({ data: result, type: "result" });
  });
}

export async function generateResumeReview(input: {
  resumeProfile: ResumeProfile;
  jobDescription?: string | null;
}): Promise<ResumeReviewGenerationResult> {
  const { text } = await createResumeReviewAgent().generate({
    prompt: buildResumeReviewPrompt(input),
  });
  return parseStructuredResumeReview(text);
}

/**
 * Combined: parse profile + generate questions in one blocking call.
 * Used by endpoints that need the full result at once (create/edit interview
 * fallback path when the client hasn't pre-parsed the resume).
 */
export async function analyzeResumeFile(file: File): Promise<ResumeAnalysisResult> {
  const { resumeProfile } = await parseResumeFastToProfile(file);
  const interviewQuestions = await generateInterviewQuestionsForProfile(resumeProfile);
  return { fileName: file.name, interviewQuestions, resumeProfile };
}

// Re-export the subagent's schema so other modules can validate structured
// JSON from the same source of truth without reaching into the parser module.
export { structuredSchema as resumeParserStructuredSchema };
