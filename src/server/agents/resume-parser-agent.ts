import type { ParsedResumePdf, UploadedResumePdf } from "@/lib/resume-pdf";
import type { ResumeProfile } from "@/lib/interview/types";
import { parseResumeFastFromUrl } from "@/lib/resume-parse-pipeline";
import { readPdfBytes } from "@/lib/resume-pdf";
import { structuredSchema } from "./resume-parser-schema";
import type { ResumeParserResult, ResumeParserStructured } from "./resume-parser-schema";

export type { ResumeParserResult, ResumeParserStructured };
export { structuredSchema };

export interface ResumeParserOptions {
  parseUploadedResume?: (file: UploadedResumePdf) => Promise<ParsedResumePdf>;
}

/**
 * Resume parsing subagent — non-streaming entry point used by `/chat` tools.
 * Runs the deterministic Qwen-VL OCR pipeline (rasterize → OCR → structured).
 */
export async function parseResumeSubagent(
  file: UploadedResumePdf,
  _options: ResumeParserOptions = {},
): Promise<ResumeParserResult> {
  const result = await parseResumeFastFromUrl(file.url);
  return {
    filename: file.filename,
    pageCount: result.pageCount,
    structured: result.structured,
    textSource: result.textSource,
  };
}

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
    email: structured.email,
    gender: structured.gender,
    name: structured.name?.trim() || "未发现信息",
    personalStrengths: structured.personalStrengths,
    phone: structured.phone,
    projectExperiences: structured.projectExperiences,
    schools: structured.schools,
    skills: structured.skills,
    targetRoles: structured.targetRoles,
    workExperiences: structured.workExperiences,
    workYears: structured.workYears,
  };
}

// 把 chat_attachment 行的 superset parsedStructured 投影到 ResumeProfile，
// 调用方据此判断是否能跳过 parseResumeFast。形状不符时静默返回 null
// ——让调用方走完整 parse 兜底。
// Project a chat_attachment row's superset parsedStructured down to
// ResumeProfile. Callers use this to decide whether they can skip
// parseResumeFast. Returns null on shape mismatch so callers fall back
// to a full parse.
export function projectAttachmentToResumeProfile(parsedStructured: unknown): ResumeProfile | null {
  if (parsedStructured === null || parsedStructured === undefined) {
    return null;
  }
  const parsed = structuredSchema.safeParse(parsedStructured);
  if (!parsed.success) {
    return null;
  }
  return toResumeProfile(parsed.data);
}

export { readPdfBytes };
