import type {
  GeneratedInterviewQuestion,
  ResumeAnalysisResult,
  ResumeProfile,
} from "@/lib/interview/types";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { generatedInterviewQuestionsSchema, resumeProfileSchema } from "@/lib/interview/types";
import { extractPdfText } from "@/lib/resume-pdf";
import { createResumeAgent } from "./resume-agent";

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
  analyze_pdf_with_vision: "视觉模型分析 PDF",
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

function normalizeResumeProfile(profile: ResumeProfile): ResumeProfile {
  return {
    age: normalizeNumber(profile.age),
    gender: trimToNull(profile.gender),
    name: profile.name.trim(),
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

const JSON_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)\s*```/;

/**
 * Extract and validate JSON from model text output.
 * Models without native structured output often wrap JSON in markdown code blocks
 * or output it inline. This helper tries both patterns.
 */
function parseJsonOutput<T>(text: string, schema: z.ZodType<T>, label: string): T {
  const trimmed = text.trim();

  // Try markdown code block first
  const blockMatch = JSON_BLOCK_RE.exec(trimmed);
  const candidates = blockMatch ? [blockMatch[1], trimmed] : [trimmed];

  for (const candidate of candidates) {
    // Find the outermost { ... } or [ ... ]
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1) {
      continue;
    }

    try {
      const raw = JSON.parse(candidate.slice(start, end + 1));
      const parsed = schema.safeParse(raw);
      if (parsed.success) {
        return parsed.data;
      }
      console.error(`[${label}] Schema validation failed:`, parsed.error.issues.slice(0, 3));
    } catch {
      // try next candidate
    }
  }

  console.error(`[${label}] Failed to parse JSON from text:`, trimmed.slice(0, 200));
  throw new Error("Failed to parse structured output from model response.");
}

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

function createPdfVisionTool(pdfBytes: Buffer) {
  return tool({
    description:
      "当提供的简历文本质量差（乱码、空白、内容过少、信息不完整）或明显是从图片 PDF 提取导致丢失大量信息时，调用此工具使用视觉模型重新解析原始 PDF，获取更完整的简历内容。",
    execute: async () => {
      const visionModelId = process.env.GOOGLE_VISION_MODEL ?? "google/gemini-2.5-flash";
      const base64PdfData = pdfBytes.toString("base64");

      const { text } = await generateText({
        messages: [
          {
            content: [
              {
                data: base64PdfData,
                mediaType: "application/pdf",
                type: "file",
              },
              {
                text: "请完整提取这份 PDF 简历中的所有文字内容，包括图片中的文字。保持原始结构和排版顺序，不要遗漏任何信息。如果存在表格，用文字形式还原。只输出提取的内容，不要添加任何分析或评论。",
                type: "text",
              },
            ],
            role: "user",
          },
        ],
        model: visionModelId,
      });

      return { resumeText: text };
    },
    inputSchema: z.object({}),
  });
}

const PROFILE_INSTRUCTIONS = `你是一名简历信息提取助手。你会收到一份从 PDF 中用文本解析器提取出来的简历文本。

【工作流程】
1) 先评估输入文本的质量：
   - 如果文本包含完整的候选人信息（姓名、教育、技能、经历等），质量良好，直接用它进行结构化提取。
   - 如果文本存在大量乱码、几乎空白、有效内容极少、关键信息明显缺失、文字断裂不成句，说明 PDF 可能是图片格式，此时应调用 analyze_pdf_with_vision 工具使用视觉模型重新提取文本，然后基于工具返回的文本进行结构化提取。
2) 基于最终确认的简历文本，严格按照下方 JSON 结构输出结构化候选人信息。

## 输出 JSON 结构（必须严格遵守每个字段的类型）

{
  "name": string,           // 候选人姓名，非空；无法确认时返回"未发现信息"
  "age": number | null,     // 年龄，仅简历明确给出时填数字，否则 null；不要根据毕业年份猜测
  "gender": string | null,  // 性别；无法确认时返回"未发现信息"
  "targetRoles": string[],  // 求职岗位列表；未知时返回 []
  "workYears": number | null, // 工作年限；无法判断时返回 null
  "skills": string[],       // 技能列表；未知时返回 []
  "schools": string[],      // 毕业院校名称列表，每项必须是纯字符串，不要返回对象；未知时返回 []
  "workExperiences": [
    {
      "company": string | null,
      "role": string | null,
      "period": string | null,
      "summary": string | null
    }
  ],
  "projectExperiences": [
    {
      "name": string | null,
      "role": string | null,
      "period": string | null,
      "techStack": string[],
      "summary": string | null
    }
  ],
  "personalStrengths": string[]
}

## 关键约束
- schools 的每一项必须是纯字符串（院校名称）。
- projectExperiences 的每一项必须包含 techStack 字段（string[]），即使为空也要写 []。
- 所有 string | null 类型字段无法确认时返回"未发现信息"，不要返回空字符串。
- 所有数组字段去重。
- personalStrengths 必须有简历依据，不要编造。
- 工作经历和项目经历的 summary 简洁，只保留关键职责、成果或内容。`;

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
 * Returns a NDJSON stream with progress events and final result.
 */
export function streamParseResumeProfile(file: File): ReadableStream<Uint8Array> {
  validateResumeFile(file);

  return createNdjsonStream(async (emit) => {
    emit({ message: "正在解析 PDF 文本…", type: "status" });

    const structuredModelId = process.env.ALIBABA_STRUCTURED_MODEL ?? "qwen3-max";
    const pdfBytes = Buffer.from(await file.arrayBuffer());
    const pdfParseText = await extractPdfText(pdfBytes);
    const canUseVision = Boolean(process.env.AI_GATEWAY_API_KEY);

    emit({ message: "正在提取候选人信息…", type: "status" });

    const profileAgent = createResumeAgent({
      enableThinking: false,
      instructions: PROFILE_INSTRUCTIONS,
      modelId: structuredModelId,
      stopWhen: stepCountIs(4),
      temperature: 0,
      tools: canUseVision ? { analyze_pdf_with_vision: createPdfVisionTool(pdfBytes) } : {},
    });

    const streamResult = await profileAgent.stream({
      prompt: `以下是从 PDF 中解析出的简历文本：\n\n${pdfParseText}`,
    });

    let stepIndex = 0;
    let fullText = "";
    for await (const part of streamResult.fullStream) {
      if (part.type === "text-delta") {
        fullText += part.text;
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

    const profile = parseJsonOutput(fullText, resumeProfileSchema, "resume-parsing");

    const result: ResumeParseResult = {
      fileName: file.name,
      resumeProfile: normalizeResumeProfile(profile),
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
 * Used by quick-start and other endpoints that need the full result at once.
 */
export async function analyzeResumeFile(file: File): Promise<ResumeAnalysisResult> {
  validateResumeFile(file);

  const structuredModelId = process.env.ALIBABA_STRUCTURED_MODEL ?? "qwen3-max";
  const pdfBytes = Buffer.from(await file.arrayBuffer());
  const pdfParseText = await extractPdfText(pdfBytes);
  const canUseVision = Boolean(process.env.AI_GATEWAY_API_KEY);

  let resumeProfile: ResumeProfile;

  try {
    const profileAgent = createResumeAgent({
      enableThinking: false,
      instructions: PROFILE_INSTRUCTIONS,
      modelId: structuredModelId,
      stopWhen: stepCountIs(4),
      temperature: 0,
      tools: canUseVision ? { analyze_pdf_with_vision: createPdfVisionTool(pdfBytes) } : {},
    });

    const { text } = await profileAgent.generate({
      prompt: `以下是从 PDF 中解析出的简历文本：\n\n${pdfParseText}`,
    });

    resumeProfile = normalizeResumeProfile(
      parseJsonOutput(text, resumeProfileSchema, "resume-parsing"),
    );
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
