import type { ParsedResumePdf, UploadedResumePdf } from "@/lib/resume-pdf";
import type { ResumeProfile } from "@/lib/interview/types";
import type { GenerateTextResult, StreamTextResult, ToolSet } from "ai";
import { gateway, generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { clipResumeText, parseResumePdf, readPdfBytes } from "@/lib/resume-pdf";
import { parseJsonOutput } from "./json-output";
import { createResumeAgent } from "./resume-agent";

// ---------------------------------------------------------------------------
// Structured output schema
//
// This is a *superset* of `ResumeProfile` (used by /studio/interviews) plus
// subagent-only signals consumed by the /chat screening agent (contact info,
// links, timelineSummary). A single subagent powers both flows; downstream
// callers either read the raw `structured` object or map through
// `toResumeProfile` to get the legacy `ResumeProfile` shape.
// ---------------------------------------------------------------------------

const workExperienceSchema = z.object({
  company: z.string().nullable(),
  period: z.string().nullable(),
  role: z.string().nullable(),
  summary: z.string().nullable(),
});

const projectExperienceSchema = z.object({
  name: z.string().nullable(),
  period: z.string().nullable(),
  role: z.string().nullable(),
  summary: z.string().nullable(),
  techStack: z.array(z.string()),
});

const structuredSchema = z.object({
  age: z.number().nullable(),
  degree: z.string().nullable(),
  education: z.string().nullable(),
  email: z.string().nullable(),
  gender: z.string().nullable(),
  graduationYear: z.string().nullable(),
  links: z.array(z.string()),
  major: z.string().nullable(),
  name: z.string().nullable(),
  personalStrengths: z.array(z.string()),
  phone: z.string().nullable(),
  projectExperiences: z.array(projectExperienceSchema),
  schools: z.array(z.string()),
  skills: z.array(z.string()),
  targetRoles: z.array(z.string()),
  timelineSummary: z.object({
    currentStatus: z.string().nullable(),
    dateRanges: z.array(z.string()),
    estimatedExperienceYears: z.number().nullable(),
    riskSignals: z.array(z.string()),
  }),
  workExperiences: z.array(workExperienceSchema),
  workYears: z.number().nullable(),
});

export type ResumeParserStructured = z.infer<typeof structuredSchema>;

export interface ResumeParserResult {
  filename: string;
  pageCount: number;
  structured: ResumeParserStructured;
  textSource: "pdf-parse" | "vision";
}

export interface ResumeParserOptions {
  parseUploadedResume?: (file: UploadedResumePdf) => Promise<ParsedResumePdf>;
}

export const PARSER_INSTRUCTIONS = `你是一名简历解析助手。你会收到一份已上传的 PDF 简历，需要通过可用工具把它解析成结构化候选人档案。

【工作流程】
1. 首先调用 extract_pdf_text 用 pdf-parse 从 PDF 中提取纯文本。
2. 检查返回文本的质量：
   - 如果文本包含完整的候选人信息（姓名、教育、技能、经历等），质量良好，直接进入第 3 步。
   - 如果文本存在大量乱码、几乎空白、有效内容极少、关键字段明显缺失，说明该 PDF 很可能是图片格式，此时调用 analyze_resume_with_vision 用视觉模型重新提取文本，然后基于视觉返回的文本进入第 3 步。
3. 基于最终确认的简历文本，严格按照下方 JSON 结构输出结构化候选人档案。完成后停止，不再调用任何工具。

## 输出 JSON 结构（字段名与类型必须严格匹配）

{
  "name": string | null,                // 候选人姓名；无法确认时返回 null
  "age": number | null,                 // 仅简历明确给出年龄时填数字；不要根据毕业年份推测
  "gender": string | null,
  "email": string | null,
  "phone": string | null,

  "schools": string[],                  // 毕业院校名称列表；每项为纯字符串；无则 []
  "degree": string | null,              // 最高学位，如 本科/硕士/博士/大专
  "major": string | null,               // 主修专业
  "graduationYear": string | null,      // 毕业年份或届别
  "education": string | null,           // 一行摘要：校/专业/届别

  "targetRoles": string[],              // 候选人自陈的求职方向；无则 []
  "workYears": number | null,           // 工作年限；简历明确给出时填数字，无法判断时 null
  "skills": string[],
  "personalStrengths": string[],        // 基于简历归纳的个人优势，需有依据
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
      "summary": string | null,
      "techStack": string[]
    }
  ],

  "links": string[],                    // 简历中的 URL；无则 []
  "timelineSummary": {
    "currentStatus": string | null,     // 当前是否在职 / 在读
    "dateRanges": string[],             // 工作/实习/项目经历的原文时间区间
    "estimatedExperienceYears": number | null,
    "riskSignals": string[]             // 时间重叠 / 长空档 / 连续短经历 / 未来时间段等异常
  }
}

## 输出约束
- 最后一步只输出 JSON 本身，不要任何额外解释文字，不要使用 Markdown 代码块。
- 无法从简历中确认的字段返回 null 或空数组，禁止编造；personalStrengths 必须有简历依据。
- skills / links / schools / targetRoles / personalStrengths 去重；skills 最多 18 项，links/schools/targetRoles/personalStrengths 最多 6 项。
- workExperiences / projectExperiences 按简历原文顺序排列；summary 保留关键职责、成果或内容，不扩写。
- projectExperiences 的每一项必须包含 techStack 字段（string[]），即使为空也要写 []。
- timelineSummary.dateRanges 保留原文时间表达。
- timelineSummary.riskSignals 仅在出现明确异常（时间重叠、6 个月以上空档、连续两段 8 个月内的短经历、未来时间段等）时填入，否则为空数组。
- timelineSummary.estimatedExperienceYears 为数字，不足一年用小数；无法推断时为 null。`;

async function extractWithVision(pdfBytes: Uint8Array): Promise<string> {
  const modelId = process.env.GOOGLE_VISION_MODEL ?? "google/gemini-2.5-flash";
  const base64Data = Buffer.from(pdfBytes).toString("base64");

  const { text } = await generateText({
    messages: [
      {
        content: [
          {
            data: base64Data,
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
    model: gateway(modelId),
  });

  return text;
}

function createExtractPdfTextTool(
  file: UploadedResumePdf,
  parse: (file: UploadedResumePdf) => Promise<ParsedResumePdf>,
) {
  return tool({
    description: "使用 pdf-parse 从 PDF 简历中提取纯文本。解析简历的第一步必须调用此工具。",
    execute: async () => {
      const parsed = await parse(file);
      const clipped = clipResumeText(parsed.text, 16_000);

      return {
        filename: parsed.filename,
        pageCount: parsed.pageCount,
        text: clipped.text,
        textChars: parsed.totalTextChars,
        truncated: clipped.truncated,
      };
    },
    inputSchema: z.object({}),
  });
}

function createAnalyzeWithVisionTool(file: UploadedResumePdf) {
  return tool({
    description:
      "当 extract_pdf_text 返回的文本质量差（乱码、空白、有效内容极少，大概率是图片格式的 PDF）时，调用此工具用视觉模型重新提取简历文字。返回视觉模型抽取到的完整简历文本。",
    execute: async () => {
      if (!process.env.AI_GATEWAY_API_KEY) {
        return {
          error:
            "未配置 AI_GATEWAY_API_KEY，无法使用视觉模型。请仅基于 extract_pdf_text 的结果继续。",
        };
      }

      const pdfBytes = await readPdfBytes(file.url);
      const text = await extractWithVision(pdfBytes);
      const clipped = clipResumeText(text, 16_000);

      return {
        text: clipped.text,
        textChars: text.length,
        truncated: clipped.truncated,
      };
    },
    inputSchema: z.object({}),
  });
}

/**
 * Build the ToolLoopAgent that drives the parsing flow. Exposed so that both
 * the one-shot consumer (`parseResumeSubagent`) and streaming consumers (see
 * `resume-analysis-agent.streamParseResumeProfile`) can share the same agent
 * configuration — tools, prompt, model, stop condition.
 */
export function buildResumeParserAgent(
  file: UploadedResumePdf,
  parse: (file: UploadedResumePdf) => Promise<ParsedResumePdf>,
) {
  const tools: ToolSet = {
    analyze_resume_with_vision: createAnalyzeWithVisionTool(file),
    extract_pdf_text: createExtractPdfTextTool(file, parse),
  };

  return createResumeAgent({
    enableThinking: false,
    instructions: PARSER_INSTRUCTIONS,
    maxOutputTokens: 4096,
    modelId: process.env.ALIBABA_STRUCTURED_MODEL ?? "qwen3-max",
    stopWhen: stepCountIs(4),
    temperature: 0,
    tools,
  });
}

export function buildResumeParserPrompt(file: UploadedResumePdf): string {
  return `请解析简历文件 ${file.filename}。按指令先调用 extract_pdf_text，然后决定是否需要 analyze_resume_with_vision，最后输出结构化 JSON。`;
}

/**
 * Collect the final `ResumeParserResult` from an agent run. Works with both
 * `agent.generate()` and `agent.stream()` outputs because both surface the
 * same `steps` / `text` shape once fully consumed.
 */
export function collectResumeParserResult(
  result: Pick<GenerateTextResult<ToolSet, never>, "steps" | "text">,
  filename: string,
): ResumeParserResult {
  // `result.toolCalls` / `result.toolResults` only surface the last step; we
  // walk every step to see whether vision was actually called and to recover
  // the pdf-parse page count from an earlier step.
  const allToolCalls = result.steps.flatMap((step) => step.toolCalls);
  const allToolResults = result.steps.flatMap((step) => step.toolResults);

  const visionCalled = allToolCalls.some((call) => call.toolName === "analyze_resume_with_vision");
  const textSource: "pdf-parse" | "vision" = visionCalled ? "vision" : "pdf-parse";

  const structured = parseJsonOutput(result.text, structuredSchema, "resume-parser");

  const pdfParseCall = allToolResults.find((item) => item.toolName === "extract_pdf_text");
  const pageCount =
    pdfParseCall && "output" in pdfParseCall && typeof pdfParseCall.output === "object"
      ? ((pdfParseCall.output as { pageCount?: number }).pageCount ?? 0)
      : 0;

  return {
    filename,
    pageCount,
    structured,
    textSource,
  };
}

/**
 * Re-export for callers that want to validate JSON against the subagent schema
 * directly (e.g. the streaming NDJSON adapter reconstructs the final text and
 * needs to validate the same way).
 */
export { structuredSchema };

/**
 * Resume parsing subagent — non-streaming entry point used by `/chat` tools.
 * See `resume-analysis-agent.streamParseResumeProfile` for the NDJSON stream
 * variant used by `/studio/interviews` and the one-click import button.
 */
export async function parseResumeSubagent(
  file: UploadedResumePdf,
  options: ResumeParserOptions = {},
): Promise<ResumeParserResult> {
  const parse = options.parseUploadedResume ?? parseResumePdf;
  const agent = buildResumeParserAgent(file, parse);

  const result = await agent.generate({
    prompt: buildResumeParserPrompt(file),
  });

  return collectResumeParserResult(result, file.filename);
}

// Re-exported to satisfy strict type consumers (streaming callers type-check
// their `fullStream` handlers against this).
export type ResumeParserStream = StreamTextResult<ToolSet, never>;

// ---------------------------------------------------------------------------
// Cross-flow helpers: File → UploadedResumePdf and structured → ResumeProfile.
// These let non-chat callers (studio interviews, one-click import) drive the
// subagent with a legacy `File` handle and consume the legacy `ResumeProfile`
// shape without duplicating the pipeline.
// ---------------------------------------------------------------------------

export async function fileToUploadedResumePdf(file: File): Promise<UploadedResumePdf> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const base64 = Buffer.from(bytes).toString("base64");
  return {
    filename: file.name,
    id: crypto.randomUUID(),
    mediaType: file.type || "application/pdf",
    url: `data:application/pdf;base64,${base64}`,
  };
}

/**
 * Project the superset `ResumeParserStructured` down to the legacy
 * `ResumeProfile` shape. Fields unique to the subagent (links, timelineSummary,
 * contact info, degree/major/graduationYear/education) are dropped here —
 * callers that need them should consume `structured` directly.
 */
export function toResumeProfile(structured: ResumeParserStructured): ResumeProfile {
  return {
    age: structured.age,
    gender: structured.gender,
    name: structured.name?.trim() || "未发现信息",
    personalStrengths: structured.personalStrengths,
    projectExperiences: structured.projectExperiences,
    schools: structured.schools,
    skills: structured.skills,
    targetRoles: structured.targetRoles,
    workExperiences: structured.workExperiences,
    workYears: structured.workYears,
  };
}
