"use client";

// 简历分析流水线 hook：parse → JD 匹配 → 身份查重 → 出题。
// 简历库与 AI 面试两个新建入口共用。组件层只负责回填表单 / 渲染 overlay；
// 所有 NDJSON 流式解析、abortController、状态机都封装在这里。
//
// Resume analysis pipeline hook shared by the resume library and AI interview
// create dialogs. Owns parse → JD match → dedup → questions state and all
// abort/stream plumbing; consumers wire callbacks and render the overlay.

import type { DedupMatchRecord } from "@/lib/client/api";
import type {
  InterviewQuestion,
  ResumeAnalysisResult,
  ResumeProfile,
} from "@/lib/shared/interview/types";

export interface ResumeAnalysisPipelineOptions {
  onProfileParsed: (input: { fileName: string; resumeProfile: ResumeProfile }) => void;
  onJobDescriptionMatched: (matchedId: string, reason: string | null) => void;
  onQuestionsGenerated: (questions: InterviewQuestion[]) => void;
}

export interface ResumeAnalysisPipelineState {
  isAnalyzingResume: boolean;
  isGeneratingQuestions: boolean;
  progressStatus: string;
  progressTools: { name: string; done: boolean }[];
  partialFields: { label: string; value: string }[];
  dedupMatches: DedupMatchRecord[] | null;
  resumePayload: ResumeAnalysisResult | null;
  resumeFile: File | null;
  isBusy: boolean;
}

export interface ResumeAnalysisPipelineHandlers {
  handleResumeChange: (file: File | null) => Promise<void>;
  handleDedupContinue: () => void;
  handleCancelAnalysis: () => void;
  reset: () => void;
}

export type ResumeAnalysisPipeline = ResumeAnalysisPipelineState & ResumeAnalysisPipelineHandlers;

export function useResumeAnalysisPipeline(
  _options: ResumeAnalysisPipelineOptions,
): ResumeAnalysisPipeline {
  throw new Error("useResumeAnalysisPipeline: not yet implemented");
}
