import {
  generateStructuredWithMastraAgent,
  resumeStructuredAgent,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators";
import { convertLegacyOfficeToOoxml } from "./office-conversion";
import { extractPdfTextPages, processPdfPagesWithMeta } from "./pdf-rasterize";
import { parseResumeWithAliyun } from "./resume-parse-aliyun";
import { getResumeParseProvider } from "./resume-parse-provider";
import { isQwenOcrConfigured, qwenVlOcr } from "./qwen-ocr";

export interface ResumeParsePipelineDependencies {
  convertLegacyOfficeToOoxml: typeof convertLegacyOfficeToOoxml;
  extractPdfTextPages: typeof extractPdfTextPages;
  generateStructuredWithMastraAgent: typeof generateStructuredWithMastraAgent;
  getResumeParseProvider: typeof getResumeParseProvider;
  isQwenOcrConfigured: typeof isQwenOcrConfigured;
  parseResumeWithAliyun: typeof parseResumeWithAliyun;
  processPdfPagesWithMeta: typeof processPdfPagesWithMeta;
  qwenVlOcr: typeof qwenVlOcr;
  resumeStructuredAgent: typeof resumeStructuredAgent;
}

export const defaultResumeParsePipelineDependencies: ResumeParsePipelineDependencies = {
  convertLegacyOfficeToOoxml,
  extractPdfTextPages,
  generateStructuredWithMastraAgent,
  getResumeParseProvider,
  isQwenOcrConfigured,
  parseResumeWithAliyun,
  processPdfPagesWithMeta,
  qwenVlOcr,
  resumeStructuredAgent,
};
