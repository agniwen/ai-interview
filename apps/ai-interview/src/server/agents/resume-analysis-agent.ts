import type {
  GeneratedInterviewQuestion,
  ResumeAnalysisResult,
  ResumeProfile,
} from "@/lib/interview/types";
import { stepCountIs } from "ai";
import { generatedInterviewQuestionsSchema } from "@/lib/interview/types";
import { parseResumePdf } from "@/lib/resume-pdf";
import { parseJsonOutput } from "./json-output";
import { createResumeAgent } from "./resume-agent";
import {
  buildResumeParserAgent,
  buildResumeParserPrompt,
  collectResumeParserResult,
  fileToUploadedResumePdf,
  structuredSchema,
  toResumeProfile,
} from "./resume-parser-agent";

// ---------------------------------------------------------------------------
// NDJSON streaming event types
// ---------------------------------------------------------------------------

export type AnalysisStreamEvent =
  | { type: "status"; message: string }
  | { type: "tool-start"; name: string }
  | { type: "tool-end"; name: string }
  | { type: "text-delta"; text: string }
  | { type: "step"; index: number }
  | { type: "result"; data: unknown }
  | { type: "error"; message: string };

const TOOL_LABELS: Record<string, string> = {
  analyze_resume_with_vision: "视觉模型分析 PDF",
  extract_pdf_text: "pdf-parse 提取文本",
};

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

const MAX_RESUME_FILE_SIZE = 10 * 1024 * 1024;

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
    gender: trimToNull(profile.gender),
    name: profile.name.trim() || "未发现信息",
    personalStrengths: uniqueStrings(profile.personalStrengths),
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
    throw new Error("简历 PDF 不能超过 10 MB。");
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

    const uploadedPdf = await fileToUploadedResumePdf(file);
    const agent = buildResumeParserAgent(uploadedPdf, parseResumePdf);

    const streamResult = await agent.stream({
      prompt: buildResumeParserPrompt(uploadedPdf),
    });

    let stepIndex = 0;
    for await (const part of streamResult.fullStream) {
      if (part.type === "text-delta") {
        emit({ text: part.text, type: "text-delta" });
      } else if (part.type === "tool-input-start") {
        emit({ name: TOOL_LABELS[part.toolName] ?? part.toolName, type: "tool-start" });
      } else if (part.type === "tool-result" || part.type === "tool-error") {
        const { toolName } = part as { toolName: string };
        emit({ name: TOOL_LABELS[toolName] ?? toolName, type: "tool-end" });
      } else if (part.type === "start-step") {
        stepIndex += 1;
        emit({ index: stepIndex, type: "step" });
      }
    }

    const finalText = await streamResult.text;
    const finalSteps = await streamResult.steps;
    const { structured } = collectResumeParserResult(
      { steps: finalSteps, text: finalText },
      file.name,
    );

    const result: ResumeParseResult = {
      fileName: file.name,
      resumeProfile: normalizeResumeProfile(toResumeProfile(structured)),
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

    const structuredModelId = process.env.ALIBABA_STRUCTURED_MODEL ?? "qwen3-max";

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

/**
 * Combined: parse profile + generate questions in one blocking call.
 * Used by endpoints that need the full result at once (create/edit interview
 * fallback path when the client hasn't pre-parsed the resume).
 */
export async function analyzeResumeFile(file: File): Promise<ResumeAnalysisResult> {
  validateResumeFile(file);

  let resumeProfile: ResumeProfile;

  try {
    const uploadedPdf = await fileToUploadedResumePdf(file);
    const agent = buildResumeParserAgent(uploadedPdf, parseResumePdf);

    const result = await agent.generate({
      prompt: buildResumeParserPrompt(uploadedPdf),
    });

    const { structured } = collectResumeParserResult(result, file.name);
    resumeProfile = normalizeResumeProfile(toResumeProfile(structured));
  } catch (error) {
    if (error instanceof ResumeAnalysisError) {
      throw error;
    }
    throw new ResumeAnalysisError(
      error instanceof Error ? error.message : "Failed to extract resume information.",
      "resume-parsing",
    );
  }

  try {
    const structuredModelId = process.env.ALIBABA_STRUCTURED_MODEL ?? "qwen3-max";
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

    return {
      fileName: file.name,
      interviewQuestions: normalizeInterviewQuestions(parsed.interviewQuestions),
      resumeProfile,
    };
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

// Re-export the subagent's schema so other modules can validate structured
// JSON from the same source of truth without reaching into the parser module.
export { structuredSchema as resumeParserStructuredSchema };
