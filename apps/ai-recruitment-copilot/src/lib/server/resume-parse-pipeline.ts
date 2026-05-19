import "server-only";

// End-to-end deterministic resume parsing pipeline.
// Runs Qwen-VL OCR on every page of the PDF, then extracts structured
// candidate info via a single generateText / parseJsonOutput call.

import { generateText } from "ai";
import { parseJsonOutput } from "@/server/agents/json-output";
import { createAlibabaProvider } from "@/server/agents/provider";
import { structuredSchema } from "@arc/db-schema/resume-parser-schema";
import type { ResumeParserStructured } from "@arc/db-schema/resume-parser-schema";
import { rasterizePdfWithMeta } from "./pdf-rasterize";
import { isQwenOcrConfigured, qwenVlOcr } from "./qwen-ocr";

const STRUCTURED_TEXT_MAX_CHARS = 16_000;

const STRUCTURED_INSTRUCTIONS = `你是一名简历解析助手。给你一段简历文本，请严格按照下方 JSON 结构输出结构化候选人档案。

## 输出 JSON 结构（字段名与类型必须严格匹配）

{
  "name": string | null,
  "age": number | null,
  "gender": string | null,
  "email": string | null,
  "phone": string | null,
  "schools": string[],
  "degree": string | null,
  "major": string | null,
  "graduationYear": string | null,
  "education": string | null,
  "targetRoles": string[],
  "workYears": number | null,
  "skills": string[],
  "personalStrengths": string[],
  "workExperiences": [
    { "company": string | null, "role": string | null, "period": string | null, "summary": string | null }
  ],
  "projectExperiences": [
    { "name": string | null, "role": string | null, "period": string | null, "summary": string | null, "techStack": string[] }
  ],
  "links": string[],
  "timelineSummary": {
    "currentStatus": string | null,
    "dateRanges": string[],
    "estimatedExperienceYears": number | null,
    "riskSignals": string[]
  }
}

## 输出约束
- 只输出 JSON 本身，不要任何额外解释文字，不要使用 Markdown 代码块。
- 无法从简历中确认的字段返回 null 或空数组，禁止编造。
- personalStrengths 必须有简历依据。
- skills / links / schools / targetRoles / personalStrengths 去重；skills 最多 18 项，其余最多 6 项。
- skills 字段必须使用业内通用规范名（保留通行大小写），不要写候选人简历里的别名 / 缩写 / 版本号 / .js 后缀：
    · "Vue 3" / "Vue.js" / "VueJS" / "vue" → "Vue"
    · "React.js" / "ReactJS" / "react" → "React"
    · "TS" → "TypeScript"
    · "JS" → "JavaScript"
    · "Node" / "NodeJS" / "node.js" → "Node.js"
    · "K8s" / "kubernetes" → "Kubernetes"
    · "Tailwind" / "TailwindCSS" → "Tailwind CSS"
    · "PG" / "Postgres" / "postgresql" → "PostgreSQL"
    · 当原文里出现品牌组合名时不要省略空格："ClaudeCode" → "Claude Code"。
    · 当某项无法判断业内规范名时，保留原文并 trim，不要瞎改。
- workExperiences / projectExperiences 按简历原文顺序排列；summary 保留关键职责、成果或内容，不扩写。
- projectExperiences 的每一项必须包含 techStack 字段（string[]），即使为空也要写 []。
- timelineSummary.dateRanges 保留原文时间表达。
- timelineSummary.riskSignals 仅在出现明确异常（时间重叠、6 个月以上空档、连续两段 8 个月内的短经历、未来时间段等）时填入，否则为空数组。
- timelineSummary.estimatedExperienceYears 为数字，不足一年用小数；无法推断时为 null。
- age 仅在简历明确给出时填数字，不要根据毕业年份推测。`;

export type ResumeTextSource = "qwen-ocr";

export interface ParsedResumeOcr {
  text: string;
  pageCount: number;
  textSource: ResumeTextSource;
}

export interface ParsedResumeFast extends ParsedResumeOcr {
  structured: ResumeParserStructured;
}

function clipForStructured(text: string): string {
  if (text.length <= STRUCTURED_TEXT_MAX_CHARS) {
    return text;
  }
  return `${text.slice(0, STRUCTURED_TEXT_MAX_CHARS)}\n\n[...content truncated...]`;
}

export async function generateResumeStructured(text: string): Promise<ResumeParserStructured> {
  const provider = createAlibabaProvider({ enableThinking: false });
  const modelId = process.env.ALIBABA_STRUCTURED_MODEL ?? "deepseek-v4-pro";
  const { text: rawOutput } = await generateText({
    // 中文简历每字约 1 token，加上 projectExperiences/workExperiences 等结构开销，
    // 项目/经历较多的简历输出会很长，给到 16384 留足余量避免 summary 中途截断。
    // Chinese resumes use ~1 token per character; with verbose project / work
    // experience summaries the output can be very long, so allow 16384 to leave
    // headroom and avoid truncating mid-string.
    maxOutputTokens: 16_384,
    model: provider(modelId),
    prompt: `${STRUCTURED_INSTRUCTIONS}\n\n简历文本：\n${clipForStructured(text)}`,
    temperature: 0,
  });
  return parseJsonOutput(rawOutput, structuredSchema, "resume-parse-pipeline");
}

/**
 * OCR-only: rasterize PDF → Qwen-VL OCR → 返回纯文本与页数。
 * 不跑结构化抽取，让调用方在真正需要 LLM 结构化时再单独跑。
 *
 * OCR-only path: rasterize + Qwen-VL OCR. Returns plain text & page count;
 * callers run structured extraction separately when they actually need it.
 */
export async function parseResumeOcrOnly(bytes: Uint8Array): Promise<ParsedResumeOcr> {
  if (!isQwenOcrConfigured()) {
    throw new Error("Qwen OCR is not configured (missing ALIBABA_API_KEY).");
  }

  const { pages, pageCount } = await rasterizePdfWithMeta(bytes, { maxPages: 6, scale: 2 });

  if (pages.length === 0) {
    throw new Error("Rasterization produced no pages; PDF may be empty or unreadable.");
  }

  const ocrTexts = await Promise.all(pages.map((png) => qwenVlOcr(png)));
  const text = ocrTexts.filter((chunk) => chunk.trim().length > 0).join("\n\n");

  if (text.trim().length === 0) {
    throw new Error("Qwen OCR returned empty text for every page.");
  }

  return { pageCount, text, textSource: "qwen-ocr" };
}

/**
 * 完整解析：OCR + 结构化抽取。
 * 现在内部由 parseResumeOcrOnly + generateResumeStructured 两步组合而成，
 * 行为与拆分前等价，保留导出以便那些一次性需要结构化结果的调用方继续用。
 *
 * Full pipeline: OCR + structured extraction. Now a composition of
 * parseResumeOcrOnly + generateResumeStructured. Behavior is unchanged from
 * the pre-split version; callers that want both in one shot keep using this.
 */
export async function parseResumeFast(bytes: Uint8Array): Promise<ParsedResumeFast> {
  const ocr = await parseResumeOcrOnly(bytes);
  const structured = await generateResumeStructured(ocr.text);
  return { ...ocr, structured };
}
