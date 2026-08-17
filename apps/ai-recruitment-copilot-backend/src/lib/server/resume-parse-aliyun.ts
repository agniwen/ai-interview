import { parseJsonOutput } from "@arc/ai-recruitment-copilot-backend/server/agents/json-output";
import { structuredSchema } from "@arc/db-schema/resume-parser-schema";
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
    const fileName = input.fileName?.trim() || "resume.pdf";
    const uploadFileName = fileName.toLowerCase().endsWith(".htm")
      ? `${fileName.slice(0, -4)}.html`
      : fileName;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = await dependencies.runAliyunResumeExtraction({
        apiKey,
        bytes: input.bytes,
        fileName: uploadFileName,
        prompt: ALIYUN_RESUME_EXTRACTION_PROMPT,
      });
      try {
        const structured = parseJsonOutput(
          result.content,
          structuredSchema,
          "aliyun-resume-extraction",
        );
        return {
          pageCount: result.pageCount ?? 1,
          structured,
          text: JSON.stringify(structured),
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
