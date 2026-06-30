import { Agent } from "@mastra/core/agent";
import type { z } from "zod";
import {
  configureAlibabaCodingPlanApiKey,
  mastraModels,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/models";

configureAlibabaCodingPlanApiKey();

export interface MastraGenerateOptions {
  modelSettings?: {
    maxOutputTokens?: number;
    temperature?: number;
  };
  structuredOutput?: {
    schema: unknown;
  };
}

export interface MastraGenerateResult {
  error?: Error;
  object?: unknown;
  text: string;
}

export interface MastraGeneratorLike {
  generate(messages: string, options?: MastraGenerateOptions): Promise<MastraGenerateResult>;
}

export const titleAgent = new Agent({
  id: "title-agent",
  instructions: "你是会话标题助手。根据用户第一条消息生成简洁、准确的中文标题。",
  maxRetries: 1,
  model: mastraModels.fastModel,
  name: "TitleAgent",
});

export const jobDescriptionDraftAgent = new Agent({
  id: "job-description-draft-agent",
  instructions: "你是 HR 岗位配置助手，负责生成岗位描述和 AI 面试 Prompt。",
  maxRetries: 1,
  model: mastraModels.structuredModel,
  name: "JobDescriptionDraftAgent",
});

export const interviewQuestionAgent = new Agent({
  id: "interview-question-agent",
  instructions: "你是技术面试出题助手，负责根据岗位、简历和 HR 指令生成结构化面试题。",
  maxRetries: 1,
  model: mastraModels.structuredModel,
  name: "InterviewQuestionAgent",
});

export const formQuestionAgent = new Agent({
  id: "form-question-agent",
  instructions: "你是 HR 面试表单设计助手，负责生成结构化候选人表单题目。",
  maxRetries: 1,
  model: mastraModels.structuredModel,
  name: "FormQuestionAgent",
});

export const resumeStructuredAgent = new Agent({
  id: "resume-structured-agent",
  instructions: "你是简历解析助手，负责把简历原文抽取成严格的候选人结构化档案。",
  maxRetries: 1,
  model: mastraModels.structuredModel,
  name: "ResumeStructuredAgent",
});

export const jobDescriptionMatchAgent = new Agent({
  id: "job-description-match-agent",
  instructions: "你是招聘匹配助手，负责从候选岗位中选择与候选人结构化简历最匹配的一项。",
  maxRetries: 1,
  model: mastraModels.structuredModel,
  name: "JobDescriptionMatchAgent",
});

export const resumeHardFilterAgent = new Agent({
  id: "resume-hard-filter-agent",
  instructions: "你是招聘门槛提取助手，负责从 JD 中抽取结构化硬性要求。",
  maxRetries: 1,
  model: mastraModels.structuredModel,
  name: "ResumeHardFilterAgent",
});

export const resumeReviewQualitativeAgent = new Agent({
  id: "resume-review-qualitative-agent",
  instructions: "你是招聘评估助手，负责生成简历与岗位匹配的结构化定性评价。",
  maxRetries: 1,
  model: mastraModels.structuredModel,
  name: "ResumeReviewQualitativeAgent",
});

export const resumeReviewScoringAgent = new Agent({
  id: "resume-review-scoring-agent",
  instructions: "你是招聘评分助手，负责生成简历与岗位匹配的六维度结构化评分。",
  maxRetries: 1,
  model: mastraModels.structuredModel,
  name: "ResumeReviewScoringAgent",
});

export const interviewReportSummaryAgent = new Agent({
  id: "interview-report-summary-agent",
  instructions: "你是面试报告撰写助手，负责根据面试 transcript 生成摘要。",
  maxRetries: 1,
  model: mastraModels.fastModel,
  name: "InterviewReportSummaryAgent",
});

export const interviewReportEvaluationAgent = new Agent({
  id: "interview-report-evaluation-agent",
  instructions: "你是专业面试评估专家，负责根据面试 transcript 和题目生成结构化评价。",
  maxRetries: 1,
  model: mastraModels.structuredModel,
  name: "InterviewReportEvaluationAgent",
});

export const resumeEducationBackfillAgent = new Agent({
  id: "resume-education-backfill-agent",
  instructions: "你是简历教育经历解析助手，只提取教育经历并输出结构化字段。",
  maxRetries: 1,
  model: mastraModels.structuredModel,
  name: "ResumeEducationBackfillAgent",
});

function buildModelSettings({
  maxOutputTokens,
  temperature,
}: {
  maxOutputTokens?: number;
  temperature?: number;
}): MastraGenerateOptions["modelSettings"] {
  const settings: NonNullable<MastraGenerateOptions["modelSettings"]> = {};
  if (typeof maxOutputTokens === "number") {
    settings.maxOutputTokens = maxOutputTokens;
  }
  if (typeof temperature === "number") {
    settings.temperature = temperature;
  }
  return settings;
}

export async function generateTextWithMastraAgent({
  agent,
  maxOutputTokens,
  prompt,
  temperature,
}: {
  agent: MastraGeneratorLike;
  maxOutputTokens?: number;
  prompt: string;
  temperature?: number;
}): Promise<string> {
  const result = await agent.generate(prompt, {
    modelSettings: buildModelSettings({ maxOutputTokens, temperature }),
  });
  if (result.error) {
    throw result.error;
  }
  return result.text;
}

export async function generateStructuredWithMastraAgent<TSchema extends z.ZodType>({
  agent,
  maxOutputTokens,
  prompt,
  schema,
  temperature,
}: {
  agent: MastraGeneratorLike;
  maxOutputTokens?: number;
  prompt: string;
  schema: TSchema;
  temperature?: number;
}): Promise<z.infer<TSchema>> {
  const result = await agent.generate(prompt, {
    modelSettings: buildModelSettings({ maxOutputTokens, temperature }),
    structuredOutput: { schema },
  });
  if (result.error) {
    throw result.error;
  }

  const parsed = schema.safeParse(result.object);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "AI 生成的结构化内容校验失败。");
  }
  return parsed.data;
}
