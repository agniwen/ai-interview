import { parseJsonOutput } from "@app/server/server/agents/json-output";
import {
  normalizeResumeStructuredSourceFileName,
  resumeParserGenerationSchema,
} from "@arc/db-schema/resume-parser-schema";
import type { ResumeParserStructured } from "@arc/db-schema/resume-parser-schema";
import { runAliyunResumeExtraction } from "./aliyun-docmining";
import { ALIYUN_RESUME_EXTRACTION_PROMPT } from "./aliyun-resume-prompt";

export interface AliyunParsedResume {
  pageCount: number;
  structured: ResumeParserStructured;
  text: string;
  textSource: "aliyun-docmining";
}

export interface ResumeParseAliyunDependencies {
  runAliyunResumeExtraction: typeof runAliyunResumeExtraction;
}

const defaultResumeParseAliyunDependencies: ResumeParseAliyunDependencies = {
  runAliyunResumeExtraction,
};

export function createResumeParseWithAliyun(
  dependencies: ResumeParseAliyunDependencies = defaultResumeParseAliyunDependencies,
) {
  return async function parseResumeWithAliyun(input: {
    bytes: Uint8Array;
    fileName?: string;
  }): Promise<AliyunParsedResume> {
    const apiKey = process.env.ALIBABA_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("Aliyun document mining is not configured (missing ALIBABA_API_KEY).");
    }
    const fileName = normalizeResumeStructuredSourceFileName(input.fileName || "resume.pdf");
    const uploadFileName = fileName.toLowerCase().endsWith(".htm")
      ? `${fileName.slice(0, -4)}.html`
      : fileName;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = await dependencies.runAliyunResumeExtraction({
        apiKey,
        bytes: input.bytes,
        fileName: uploadFileName,
        prompt: `${ALIYUN_RESUME_EXTRACTION_PROMPT}\n\n简历文件信息：\n- 简历文件名：${JSON.stringify(fileName)}\n- 文件名可能包含候选人姓名（用户名），可作为 name 字段的辅助线索；若与简历正文冲突，以简历正文中的明确事实为准。文件名中的岗位、薪资、平台标签等不得直接当作候选人事实。`,
      });
      try {
        const structured = parseJsonOutput(
          result.content,
          resumeParserGenerationSchema,
          "aliyun-resume-extraction",
        );
        const structuredWithSource = { ...structured, sourceFileName: fileName };
        return {
          pageCount: result.pageCount ?? 1,
          structured: structuredWithSource,
          text: JSON.stringify(structuredWithSource),
          textSource: "aliyun-docmining",
        };
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          console.warn("[aliyun-resume-extraction] invalid structured output; retrying once");
        }
      }
    }
    if (lastError instanceof Error) {
      throw new TypeError(lastError.message, { cause: lastError });
    }
    throw new Error("Aliyun resume extraction returned invalid structured output.");
  };
}

export const parseResumeWithAliyun = createResumeParseWithAliyun();
