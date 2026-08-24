import type {
  GeneratedInterviewQuestion,
  ResumeAnalysisResult,
  ResumeProfile,
} from "@arc/db-schema/interview/types";
import { uniq } from "lodash-es";
import { z } from "zod";
import { normalizeResumeScoringFacts } from "@arc/db-schema/resume-scoring-facts";
import {
  generatedInterviewQuestionSchema,
  generatedInterviewQuestionsSchema,
} from "@arc/db-schema/interview/types";
import { generateResumeStructured } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-pipeline";
import {
  getResumeDocumentExtension,
  isSupportedResumeDocumentInput,
  supportedResumeDocumentLabel,
} from "@arc/shared/resume-documents";
import { isResumeParseCacheEnabled } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-cache-policy";
import { isResumeParseCacheSourceCompatible } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-provider";
import type { ResumeTextSource } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-pipeline";
import {
  buildAttachmentKeyByHash,
  putObjectBytes,
} from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import {
  generateStructuredWithMastraAgent,
  interviewQuestionAgent,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators";
import { createAiRunEventStream } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/adapters/ai-run-stream";
import {
  runResumeParseWorkflow,
  streamResumeParseWorkflow,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows/resume-parse-workflow";
import type {
  ResumeParseWorkflowProgressEvent,
  ResumeParseWorkflowOutput,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows/resume-parse-workflow";
import { sha256HexOfBytes } from "@arc/shared/file-hash";
import {
  createAttachment,
  findAttachmentByContentHash,
  updateStructuredByHash,
} from "@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat-attachments";
import {
  projectAttachmentToResumeProfile,
  structuredSchema,
  toResumeProfile,
} from "./resume-parser-agent";
import type { ResumeParserStructured } from "./resume-parser-agent";

import type { AiRunEvent } from "@arc/shared/ai-run-events";

const PARSE_STAGE_LABELS = {
  ocr: "OCR 识别简历",
  structured: "提取结构化字段",
} as const;

type AiRunEventDraft = AiRunEvent extends infer T
  ? T extends { runId: string }
    ? Omit<T, "runId"> & { runId?: string }
    : never
  : never;

function emitResumeParseProgressEvent(
  event: ResumeParseWorkflowProgressEvent,
  emitAiRun: (event: AiRunEventDraft) => void,
) {
  if (event.type === "document.pages.ready") {
    emitAiRun({
      detail: {
        kind: "document-pages",
        renderedPages: event.renderedPages,
        totalPages: event.totalPages,
      },
      label: `已解析出 ${event.renderedPages} 页，准备 OCR`,
      progress: 0,
      stepId: "ocr-resume-pages",
      type: "step.progress",
    });
    return;
  }
  if (event.type === "ocr.page.started") {
    emitAiRun({
      detail: {
        kind: "ocr-page",
        page: event.page,
        status: "running",
        totalPages: event.totalPages,
      },
      label: `正在识别第 ${event.page}/${event.totalPages} 页`,
      progress: (event.page - 1) / event.totalPages,
      stepId: "ocr-resume-pages",
      type: "step.progress",
    });
    return;
  }
  if (event.type === "ocr.page.completed") {
    emitAiRun({
      detail: {
        charCount: event.charCount,
        kind: "ocr-page",
        page: event.page,
        status: "completed",
        totalPages: event.totalPages,
      },
      label: `第 ${event.page}/${event.totalPages} 页识别完成`,
      progress: event.page / event.totalPages,
      stepId: "ocr-resume-pages",
      type: "step.progress",
    });
    emitAiRun({
      artifactType: "resume.ocr.page",
      data: {
        charCount: event.charCount,
        page: event.page,
        textPreview: event.textPreview,
        totalPages: event.totalPages,
      },
      stepId: "ocr-resume-pages",
      type: "step.preview",
    });
    return;
  }
  if (event.type === "ocr.completed") {
    emitAiRun({
      detail: {
        kind: "ocr-page",
        status: "completed",
        totalPages: event.totalPages,
      },
      label: `OCR 完成，共 ${event.renderedPages} 页`,
      progress: 1,
      stepId: "ocr-resume-pages",
      type: "step.progress",
    });
    return;
  }
  if (event.type === "structure.started") {
    emitAiRun({
      label: PARSE_STAGE_LABELS.structured,
      stepId: "structure-resume",
      type: "step.started",
    });
    return;
  }
  if (event.type === "structure.completed") {
    emitAiRun({
      artifactType: "resume.profile.preview",
      data: event.preview,
      stepId: "structure-resume",
      type: "step.preview",
    });
    emitAiRun({
      output: event.preview,
      stepId: "structure-resume",
      type: "step.completed",
    });
  }
}

function emitForegroundWorkflowEvent(
  event: AiRunEvent,
  emitAiRun: (event: AiRunEventDraft) => void,
) {
  if (
    event.type === "run.started" ||
    event.type === "run.completed" ||
    event.type === "run.failed"
  ) {
    return;
  }
  if (event.type === "step.completed") {
    emitAiRun({
      runId: event.runId,
      stepId: event.stepId,
      traceId: event.traceId,
      type: "step.completed",
    });
    return;
  }
  emitAiRun(event);
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

const errorMessageSchema = z.object({ message: z.string().trim().min(1) }).passthrough();

function uniqueStrings(values: string[]) {
  return uniq(values.map((value) => value.trim()).filter(Boolean));
}

function trimToNull(value: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function normalizeNumber(value: number | null) {
  return value !== null && Number.isFinite(value) ? value : null;
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
  const skills = uniqueStrings(profile.skills);
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
    scoringFacts: normalizeResumeScoringFacts({
      facts: profile.scoringFacts,
      projectExperienceCount: profile.projectExperiences.length,
      skills,
      workExperienceCount: profile.workExperiences.length,
    }),
    skills,
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
    evaluationFocus: question.evaluationFocus?.trim() || null,
    followUpDirections: question.followUpDirections?.trim() || null,
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
    {
      "difficulty": "easy" | "medium" | "hard",
      "evaluationFocus": string,
      "followUpDirections": string,
      "question": string
    }
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
5. 每道题必须给出 evaluationFocus，说明本题要验证的能力点、真实性风险或岗位匹配点。
6. 每道题必须给出 followUpDirections，说明面试官可以顺着候选人回答继续深挖的方向；不要写标准答案。
7. 题目语言以候选人的主要语言为主：根据简历、目标岗位和岗位说明中占主导的语言判断；如果无法判断，默认使用中文。
8. 不要给答案，不要输出解释，不要重复题目。`;

const generatedInterviewQuestionsWithGuidanceSchema = generatedInterviewQuestionsSchema.extend({
  interviewQuestions: z
    .array(
      generatedInterviewQuestionSchema.extend({
        evaluationFocus: z.string().trim().min(1).max(500),
        followUpDirections: z.string().trim().min(1).max(1000),
      }),
    )
    .length(10),
});

export interface InterviewQuestionGenerationDependencies {
  generateQuestions: (
    prompt: string,
  ) => Promise<z.infer<typeof generatedInterviewQuestionsWithGuidanceSchema>>;
}

const defaultInterviewQuestionGenerationDependencies: InterviewQuestionGenerationDependencies = {
  generateQuestions: (prompt) =>
    generateStructuredWithMastraAgent({
      agent: interviewQuestionAgent,
      prompt,
      schema: generatedInterviewQuestionsWithGuidanceSchema,
      temperature: 0.3,
    }),
};

export interface ResumeParseResult {
  fileName: string;
  resumeProfile: ResumeProfile;
  resumeText: string | null;
}

export interface StreamParseResumeContext {
  /**
   * 本次请求解析出的 userId / organizationId。提供这两个值才会在 cache miss
   * 时把解析结果回写 chat_attachment 注册表 + S3，否则只返回解析结果不落表。
   * Provide both to populate the chat_attachment registry + S3 on cache miss;
   * omit to keep this endpoint side-effect-free.
   */
  userId: string;
  organizationId: string | null;
}

export interface ResumeParseDependencies {
  findCachedAttachment: (contentHash: string) => Promise<CachedResumeAttachment | null>;
  generateStructured: typeof generateResumeStructured;
  hashBytes: typeof sha256HexOfBytes;
  runWorkflow: (
    input: Parameters<typeof runResumeParseWorkflow>[0],
  ) => Promise<ResumeParseWorkflowResult>;
  streamWorkflow: (
    input: Parameters<typeof streamResumeParseWorkflow>[0],
    options: Parameters<typeof streamResumeParseWorkflow>[1],
  ) => Promise<ResumeParseWorkflowResult>;
  updateCachedStructured: typeof updateStructuredByHash;
}

type CachedResumeAttachment = Omit<
  NonNullable<Awaited<ReturnType<typeof findAttachmentByContentHash>>>,
  "parsedTextSource"
> & {
  parsedTextSource?: NonNullable<
    Awaited<ReturnType<typeof findAttachmentByContentHash>>
  >["parsedTextSource"];
};

type ResumeParseWorkflowResult = Pick<
  ResumeParseWorkflowOutput,
  "fileHash" | "pageCount" | "structured" | "text" | "textSource"
> & {
  bytesBase64?: string;
  fileName?: string;
  mediaType?: string;
  preview?: ResumeParseWorkflowOutput["preview"];
};

const defaultResumeParseDependencies: ResumeParseDependencies = {
  findCachedAttachment: findAttachmentByContentHash,
  generateStructured: generateResumeStructured,
  hashBytes: sha256HexOfBytes,
  runWorkflow: runResumeParseWorkflow,
  streamWorkflow: streamResumeParseWorkflow,
  updateCachedStructured: updateStructuredByHash,
};

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
 * This is the foreground AiRun event stream wrapper around the resume parse
 * workflow. It emits Mastra workflow progress plus page-level OCR details, then
 * returns the parsed profile in the terminal run.completed event.
 *
 * When `context` is supplied, the parse result is also persisted into the
 * shared chat_attachment registry on a cache miss so that later studio saves
 * and chat uploads of the same file hit the hash cache instead of re-parsing.
 */
export function streamParseResumeProfile(
  file: File,
  context?: StreamParseResumeContext,
  dependencies = defaultResumeParseDependencies,
): ReadableStream<Uint8Array> {
  validateResumeFile(file);

  const runId = crypto.randomUUID();
  return createAiRunEventStream({
    run: async (emit) => {
      const emitAiRun = (event: AiRunEventDraft) => {
        // SAFETY: AiRunEventDraft is derived from AiRunEvent with only runId made optional, and this expression always restores runId.
        emit({ ...event, runId: event.runId ?? runId } as AiRunEvent);
      };

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
      const contentHash = await dependencies.hashBytes(bytes);
      const cachedAttachment = isResumeParseCacheEnabled()
        ? await dependencies.findCachedAttachment(contentHash)
        : null;
      const existing =
        cachedAttachment && isResumeParseCacheSourceCompatible(cachedAttachment.parsedTextSource)
          ? cachedAttachment
          : null;
      if (existing?.parsedStructured) {
        const cached = projectAttachmentToResumeProfile(existing.parsedStructured);
        if (cached) {
          emitAiRun({
            label: "命中已有简历缓存，跳过解析。",
            stepId: "parse-resume-cache",
            type: "step.progress",
          });
          return {
            fileName: file.name,
            resumeProfile: cached,
            resumeText: existing.parsedText ?? null,
          };
        }
      }
      if (existing?.parsedText && existing.parsedText.trim().length > 0) {
        emitAiRun({
          label: PARSE_STAGE_LABELS.structured,
          stepId: "structure-resume",
          type: "step.started",
        });

        const structured = await dependencies.generateStructured(existing.parsedText, {
          fileName: file.name,
        });
        await dependencies.updateCachedStructured(contentHash, structured);

        emitAiRun({
          artifactType: "resume.profile.preview",
          data: {
            name: structured.name,
            schools: structured.schools,
            skills: structured.skills,
            targetRoles: structured.targetRoles,
            workYears: structured.workYears,
          },
          stepId: "structure-resume",
          type: "step.preview",
        });
        emitAiRun({
          stepId: "structure-resume",
          type: "step.completed",
        });
        return {
          fileName: file.name,
          resumeProfile: normalizeResumeProfile(toResumeProfile(structured)),
          resumeText: existing.parsedText,
        };
      }

      const workflowInput = {
        bytes,
        fileName: file.name,
        mediaType: file.type,
      };
      const parsed = await dependencies.streamWorkflow(workflowInput, {
        onProgress: (event) => emitResumeParseProgressEvent(event, emitAiRun),
        onWorkflowEvent: (event) => emitForegroundWorkflowEvent(event, emitAiRun),
      });

      if (context) {
        await persistParseToRegistry({ bytes, contentHash, context, file, parsed });
      }

      const result: ResumeParseResult = {
        fileName: file.name,
        resumeProfile: normalizeResumeProfile(toResumeProfile(parsed.structured)),
        resumeText: parsed.text,
      };

      return result;
    },
    runId,
    title: "解析简历",
    workflowId: "resume-parse-workflow",
  });
}

/**
 * Stage 2: Generate interview questions from an already-parsed resume profile.
 * Returns an AiRun event stream with progress events and final result.
 */
async function generateInterviewQuestionsWithDependencies(
  resumeProfile: ResumeProfile,
  dependencies: InterviewQuestionGenerationDependencies,
): Promise<ResumeAnalysisResult["interviewQuestions"]> {
  try {
    const parsed = await dependencies.generateQuestions(
      `${QUESTION_INSTRUCTIONS}\n\n候选人信息：\n${JSON.stringify(resumeProfile, null, 2)}`,
    );
    return normalizeInterviewQuestions(parsed.interviewQuestions);
  } catch (error) {
    if (error instanceof ResumeAnalysisError) {
      throw error;
    }
    const parsedError = errorMessageSchema.safeParse(error);
    throw new ResumeAnalysisError(
      parsedError.success ? parsedError.data.message : "Failed to generate interview questions.",
      "question-generation",
      resumeProfile,
    );
  }
}

export function streamGenerateInterviewQuestions(
  resumeProfile: ResumeProfile,
  dependencies = defaultInterviewQuestionGenerationDependencies,
): ReadableStream<Uint8Array> {
  const runId = crypto.randomUUID();
  return createAiRunEventStream({
    run: async (emit) => {
      const { createInterviewQuestionsWorkflow, streamInterviewQuestionsWorkflow } =
        await import("@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows/interview-questions-workflow");
      return streamInterviewQuestionsWorkflow(
        resumeProfile,
        {
          onWorkflowEvent: (event) =>
            emitForegroundWorkflowEvent(event, (draft) => {
              // SAFETY: AiRunEventDraft is derived from AiRunEvent with only runId made optional, and this expression always restores runId.
              emit({ ...draft, runId: draft.runId ?? runId } as AiRunEvent);
            }),
        },
        createInterviewQuestionsWorkflow({
          generateQuestions: (profile) =>
            generateInterviewQuestionsWithDependencies(profile, dependencies),
        }),
      );
    },
    runId,
    title: "生成面试题",
    workflowId: "interview-questions-workflow",
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

export async function parseResumeBytesToProfile(
  input: {
    bytes: Uint8Array;
    fileName: string;
    mediaType?: string;
  },
  dependencies = defaultResumeParseDependencies,
): Promise<ParsedResumeProfileResult> {
  validateResumeDocumentInput({
    fileName: input.fileName,
    mediaType: input.mediaType,
    size: input.bytes.byteLength,
  });
  try {
    const parsed = await dependencies.runWorkflow({
      bytes: input.bytes,
      fileName: input.fileName,
      mediaType: input.mediaType,
    });
    return {
      parsedPageCount: parsed.pageCount,
      parsedStructured: parsed.structured,
      parsedText: parsed.text,
      parsedTextSource: parsed.textSource,
      resumeProfile: normalizeResumeProfile(toResumeProfile(parsed.structured)),
    };
  } catch (error) {
    if (error instanceof ResumeAnalysisError) {
      throw error;
    }
    const parsedError = errorMessageSchema.safeParse(error);
    throw new ResumeAnalysisError(
      parsedError.success ? parsedError.data.message : "Failed to extract resume information.",
      "resume-parsing",
    );
  }
}

export async function parseResumeFastToProfile(
  file: File,
  dependencies = defaultResumeParseDependencies,
): Promise<ParsedResumeProfileResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return parseResumeBytesToProfile(
    {
      bytes,
      fileName: file.name,
      mediaType: file.type,
    },
    dependencies,
  );
}

export function generateInterviewQuestionsForProfile(
  resumeProfile: ResumeProfile,
  dependencies = defaultInterviewQuestionGenerationDependencies,
): Promise<ResumeAnalysisResult["interviewQuestions"]> {
  return generateInterviewQuestionsWithDependencies(resumeProfile, dependencies);
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

export {
  buildHardFilterRejectReview,
  generateResumeScreeningEvidence,
  generateResumeScreeningResult,
  runResumeReviewHardFilter,
} from "./resume-analysis-hard-filter";
export {
  composeResumeReviewResult,
  generateResumeQualitativeReview,
  generateResumeQualitativeReviewFromMarkdown,
  generateResumeReview,
  generateResumeReviewScoring,
  streamGenerateResumeReview,
  streamGenerateResumeReviewMarkdownFirst,
} from "./resume-analysis-review";
export type {
  ResumeQualitativeReview,
  ResumeReviewGenerationResult,
  ResumeReviewScoring,
} from "./resume-analysis-review";

export async function analyzeResumeFile(file: File): Promise<ResumeAnalysisResult> {
  const { runResumeAnalysisWorkflow } =
    await import("@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows/resume-analysis-workflow");
  return runResumeAnalysisWorkflow({
    bytes: new Uint8Array(await file.arrayBuffer()),
    fileName: file.name,
    mediaType: file.type,
  });
}

// Re-export the subagent's schema so other modules can validate structured
// JSON from the same source of truth without reaching into the parser module.
export { structuredSchema as resumeParserStructuredSchema };
