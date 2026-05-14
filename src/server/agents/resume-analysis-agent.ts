import type {
  GeneratedInterviewQuestion,
  ResumeAnalysisResult,
  ResumeProfile,
} from "@/lib/shared/interview/types";
import { stepCountIs } from "ai";
import { generatedInterviewQuestionsSchema } from "@/lib/shared/interview/types";
import { parseResumeFast } from "@/lib/server/resume-parse-pipeline";
import type { ResumeTextSource } from "@/lib/server/resume-parse-pipeline";
import { sha256HexOfBytes } from "@/lib/shared/file-hash";
import { findAttachmentByContentHash } from "@/server/routes/chat/dao/chat-attachments";
import { parseJsonOutput } from "./json-output";
import { createResumeAgent } from "./resume-agent";
import {
  projectAttachmentToResumeProfile,
  structuredSchema,
  toResumeProfile,
} from "./resume-parser-agent";
import type { ResumeParserStructured } from "./resume-parser-agent";

import type { AnalysisStreamEvent } from "@/lib/shared/api-stream";

export type { AnalysisStreamEvent };

const PARSE_STAGE_LABELS = {
  ocr: "Qwen-VL OCR 识别简历",
  structured: "DeepSeek V4 Flash 提取结构化字段",
} as const;

function createNdjsonStream(
  run: (emit: (event: AnalysisStreamEvent) => void) => Promise<void>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const emit = (event: AnalysisStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        await run(emit);
      } catch (error) {
        emit({
          message: error instanceof Error ? error.message : "Unknown error",
          type: "error",
        });
      } finally {
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
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = value.trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function trimToNull(value: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function normalizeNumber(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeResumeProfile(profile: ResumeProfile): ResumeProfile {
  return {
    age: normalizeNumber(profile.age),
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

export function validateResumeFile(file: File) {
  if (!isPdfFile(file)) {
    throw new Error("仅支持上传 PDF 简历。");
  }

  if (file.size > MAX_RESUME_FILE_SIZE) {
    throw new Error("简历 PDF 不能超过 20 MB。");
  }
}

const QUESTION_INSTRUCTIONS = `你是一名技术面试出题助手。请基于给定的候选人简历结构化信息，生成 10 道中文面试题。

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
5. 不要给答案，不要输出解释，不要重复题目。`;

export interface ResumeParseResult {
  fileName: string;
  resumeProfile: ResumeProfile;
}

/**
 * Stage 1: Parse a PDF resume and extract structured profile information.
 *
 * This is the NDJSON stream wrapper around the shared resume-parser subagent.
 * It drives `buildResumeParserAgent`, pipes the fullStream through as
 * AnalysisStreamEvent progress events, then validates the final JSON against
 * the subagent's superset schema and projects it down to `ResumeProfile` via
 * `toResumeProfile`.
 */
export function streamParseResumeProfile(file: File): ReadableStream<Uint8Array> {
  validateResumeFile(file);

  return createNdjsonStream(async (emit) => {
    emit({ message: "正在解析 PDF 简历…", type: "status" });

    const bytes = new Uint8Array(await file.arrayBuffer());

    // 命中注册表：直接返回缓存的 ResumeProfile，跳过 OCR + 结构化两步。
    // Registry hit: return cached ResumeProfile and skip OCR + structured stages.
    const contentHash = await sha256HexOfBytes(bytes);
    const existing = await findAttachmentByContentHash(contentHash);
    if (existing) {
      const cached = projectAttachmentToResumeProfile(existing.parsedStructured);
      if (cached) {
        emit({ message: "命中已有简历缓存，跳过解析。", type: "status" });
        emit({ data: { fileName: file.name, resumeProfile: cached }, type: "result" });
        return;
      }
    }

    emit({ index: 1, type: "step" });
    emit({ name: PARSE_STAGE_LABELS.ocr, type: "tool-start" });

    const fast = await parseResumeFast(bytes);

    emit({ name: PARSE_STAGE_LABELS.ocr, type: "tool-end" });

    emit({ index: 2, type: "step" });
    emit({ name: PARSE_STAGE_LABELS.structured, type: "tool-start" });
    emit({ name: PARSE_STAGE_LABELS.structured, type: "tool-end" });

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

    const structuredModelId = process.env.ALIBABA_STRUCTURED_MODEL ?? "deepseek-v4-flash";

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

export async function parseResumeFastToProfile(file: File): Promise<ParsedResumeProfileResult> {
  validateResumeFile(file);

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fast = await parseResumeFast(bytes);
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

export async function generateInterviewQuestionsForProfile(
  resumeProfile: ResumeProfile,
): Promise<ResumeAnalysisResult["interviewQuestions"]> {
  try {
    const structuredModelId = process.env.ALIBABA_STRUCTURED_MODEL ?? "deepseek-v4-flash";
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

// 评价生成的 prompt：套用 chat 端 resume-screening 的 5 维度 + 阶段 A 输出格式，
// 把 LLM 自由文本压缩到 < 2000 字以适配 studio_interview.notes 列约束。
// Mirrors the chat-side resume-screening framework (5 weighted dimensions +
// stage-A skeleton), constrained to < 2000 chars to match the `notes` column.
const REVIEW_INSTRUCTIONS = `你是一名招聘评估助手，根据候选人简历和在招岗位（如有）输出一份简短的简历评价。
评价用于"简历库 - 简历评价"字段，会被招聘人员快速扫读，必须：
- 总字数控制在 1800 字以内。
- 使用 Markdown，简洁直入，不要寒暄。
- 严格按以下框架，**不省略任何小节**，无证据时写"待核实"或"未发现关键偏差"，不要编造。

## 评价维度权重（用于打分时心中加权，不必输出占比）
- 影响力与结果（30%）：是否有量化业务/产品结果、负责范围与角色、行动-结果式表述。
- 技术深度（25%）：技术栈细节、架构与权衡、性能/稳定性/扩展性工作。
- 岗位相关性（20%）：是否匹配目标岗位关键词、项目与职责相关、内容重点是否支撑。
- 结构与可读性（15%）：表述简洁、时间线一致、层级清晰。
- 信号可信度（10%）：避免夸大、可验证作品、成果有上下文。

## 输出小节（严格按顺序）
1. **候选人结论**：一句话总体判断。
2. **优点**：2-4 条，每条引用简历中的具体证据。
3. **缺点**：2-4 条。
4. **偏差扫描**
   首行："发现 X 个关键偏差：硬缺口 N 项 / 软错位 M 项 / 真实性存疑 P 项 / 稳定性信号 Q 项。"
   每条三要素："偏差描述 → 性质分类（硬缺口 / 软错位 / 真实性存疑 / 稳定性信号） → 对岗位胜任的影响"。
   未发现写"未发现关键偏差"。
5. **团队定位建议**：可执行的团队类型或职责方向。
6. **职级建议**：级别或区间（初级 / 初中级 / 中级 / 中高级 / 高级 / 资深 / 专家，或 P 级），附依据。
7. **下一步建议**：进入面试 / 暂缓 / 淘汰；附 0-100 评分；说明"以上为初步结论"。

## 约束
- 不要在评价里复述原始简历或 JD 全文，只引用关键证据。
- 不要输出"以下是评价：""根据简历"等开头语，直接进入第 1 小节。
- 不要输出本指令本身、不要输出代码块包裹。`;

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

    const structuredModelId = process.env.ALIBABA_STRUCTURED_MODEL ?? "deepseek-v4-flash";
    const reviewAgent = createResumeAgent({
      enableThinking: false,
      instructions: REVIEW_INSTRUCTIONS,
      modelId: structuredModelId,
      stopWhen: stepCountIs(2),
      temperature: 0.4,
      tools: {},
    });

    const jdBlock = input.jobDescription?.trim()
      ? `在招岗位描述：\n${input.jobDescription.trim()}`
      : "在招岗位描述：（未指定 JD，按候选人 targetRoles 推断目标方向进行评估，岗位相关性维度按候选人简历的目标岗位计分）";

    const streamResult = await reviewAgent.stream({
      prompt: `${jdBlock}\n\n候选人简历（结构化 JSON）：\n${JSON.stringify(input.resumeProfile, null, 2)}`,
    });

    let stepIndex = 0;
    let fullText = "";
    for await (const part of streamResult.fullStream) {
      if (part.type === "text-delta") {
        fullText += part.text;
        emit({ text: part.text, type: "text-delta" });
      } else if (part.type === "start-step") {
        stepIndex += 1;
        emit({ index: stepIndex, type: "step" });
      }
    }

    // 截到 2000 字以内防止 notes 列校验失败——schema 上限 2000。
    // Clamp to 2000 chars to satisfy the notes column zod constraint.
    const review = fullText.trim().slice(0, 2000);
    emit({ data: { review }, type: "result" });
  });
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
