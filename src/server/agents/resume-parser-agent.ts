import type { ParsedResumePdf, UploadedResumePdf } from "@/lib/resume-pdf";
import { gateway, generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { clipResumeText, parseResumePdf, readPdfBytes } from "@/lib/resume-pdf";
import { createResumeAgent } from "./resume-agent";
import { parseJsonOutput } from "./resume-analysis-agent";

const structuredSchema = z.object({
  candidateName: z.string().nullable(),
  degree: z.string().nullable(),
  education: z.string().nullable(),
  email: z.string().nullable(),
  graduationYear: z.string().nullable(),
  internshipHighlights: z.array(z.string()),
  links: z.array(z.string()),
  major: z.string().nullable(),
  phone: z.string().nullable(),
  projectHighlights: z.array(z.string()),
  school: z.string().nullable(),
  skills: z.array(z.string()),
  timelineSummary: z.object({
    currentStatus: z.string().nullable(),
    dateRanges: z.array(z.string()),
    estimatedExperienceYears: z.number().nullable(),
    riskSignals: z.array(z.string()),
  }),
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

const PARSER_INSTRUCTIONS = `你是一名简历解析助手。你会收到一份已上传的 PDF 简历，需要通过可用工具把它解析成结构化候选人档案。

【工作流程】
1. 首先调用 extract_pdf_text 用 pdf-parse 从 PDF 中提取纯文本。
2. 检查返回文本的质量：
   - 如果文本包含完整的候选人信息（姓名、教育、技能、经历等），质量良好，直接进入第 3 步。
   - 如果文本存在大量乱码、几乎空白、有效内容极少、关键字段明显缺失，说明该 PDF 很可能是图片格式，此时调用 analyze_resume_with_vision 用视觉模型重新提取文本，然后基于视觉返回的文本进入第 3 步。
3. 基于最终确认的简历文本，严格按照下方 JSON 结构输出结构化候选人档案。完成后停止，不再调用任何工具。

## 输出 JSON 结构（字段名与类型必须严格匹配）

{
  "candidateName": string | null,
  "degree": string | null,
  "education": string | null,
  "email": string | null,
  "graduationYear": string | null,
  "internshipHighlights": string[],
  "links": string[],
  "major": string | null,
  "phone": string | null,
  "projectHighlights": string[],
  "school": string | null,
  "skills": string[],
  "timelineSummary": {
    "currentStatus": string | null,
    "dateRanges": string[],
    "estimatedExperienceYears": number | null,
    "riskSignals": string[]
  }
}

## 输出约束
- 最后一步只输出 JSON 本身，不要任何额外解释文字，不要使用 Markdown 代码块。
- 无法从简历中确认的字段返回 null 或空数组，禁止编造。
- skills / links / projectHighlights / internshipHighlights 去重；skills 最多 18 项，其余数组最多 6 项。
- projectHighlights 与 internshipHighlights 取自简历中对应段落的要点，保留原意不扩写。
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
 * Resume parsing subagent (ToolLoopAgent):
 *   - Tools: extract_pdf_text (pdf-parse) + analyze_resume_with_vision (Gemini vision)
 *   - The agent itself decides the flow: always call extract first, fall back to
 *     vision when the text is low quality, then emit the final JSON.
 *   - Returns only the validated structured profile, metadata, and which text
 *     source produced the final JSON.
 */
export async function parseResumeSubagent(
  file: UploadedResumePdf,
  options: ResumeParserOptions = {},
): Promise<ResumeParserResult> {
  const parse = options.parseUploadedResume ?? parseResumePdf;

  const extractTool = createExtractPdfTextTool(file, parse);
  const visionTool = createAnalyzeWithVisionTool(file);

  const agent = createResumeAgent({
    enableThinking: false,
    instructions: PARSER_INSTRUCTIONS,
    maxOutputTokens: 4096,
    modelId: process.env.ALIBABA_STRUCTURED_MODEL ?? "qwen3-max",
    stopWhen: stepCountIs(4),
    temperature: 0,
    tools: {
      analyze_resume_with_vision: visionTool,
      extract_pdf_text: extractTool,
    },
  });

  const result = await agent.generate({
    prompt: `请解析简历文件 ${file.filename}。按指令先调用 extract_pdf_text，然后决定是否需要 analyze_resume_with_vision，最后输出结构化 JSON。`,
  });

  // `result.toolCalls` / `result.toolResults` only surface the last step; we
  // need to walk every step to see whether the agent actually called vision
  // and to grab the pdf-parse page count from the earlier step.
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
    filename: file.filename,
    pageCount,
    structured,
    textSource,
  };
}
