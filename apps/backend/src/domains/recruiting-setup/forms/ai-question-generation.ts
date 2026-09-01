import { BadGatewayException, BadRequestException } from "@nestjs/common";
import {
  candidateFormQuestionTypeSchema,
  DEFAULT_DISPLAY_MODE,
} from "@arc/db-schema/candidate-forms";
import type { CandidateFormQuestionInput } from "@arc/db-schema/candidate-forms";
import type { InterviewQuestionTemplateQuestionInput } from "@arc/db-schema/interview-question-templates";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { jobDescription, studioInterview } from "@arc/db-schema/schema";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requestStructuredAiJson } from "../../../infrastructure/ai/structured-json-client.js";
import type { WorkspaceDatabasePort } from "../../../infrastructure/workspace/workspace.ports.js";

export interface AiQuestionGenerationInput {
  interviewRecordId?: string;
  interviewRecordIds?: string[];
  jobDescriptionId?: string;
  jobDescriptionIds?: string[];
  prompt: string;
  templateDescription?: string;
  templateTitle?: string;
}

interface CandidateContext {
  candidateName: string;
  resumeProfile: ResumeProfile | null;
}

interface GenerationContext {
  candidates: CandidateContext[];
  job: { name: string; prompt: string | null } | null;
}
const formGenerationSchema = z.object({
  questions: z
    .array(
      z.object({
        helperText: z.string().max(500).optional(),
        label: z.string().trim().min(1).max(500),
        options: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(200),
              value: z.string().trim().min(1).max(200),
            }),
          )
          .max(20),
        required: z.boolean(),
        type: candidateFormQuestionTypeSchema,
      }),
    )
    .min(1)
    .max(25),
});

const interviewGenerationSchema = z.object({
  interviewQuestions: z
    .array(
      z.object({
        difficulty: z.enum(["easy", "medium", "hard"]),
        evaluationFocus: z.string().trim().min(1).max(500),
        followUpDirections: z.string().trim().min(1).max(1000),
        question: z.string().trim().min(1).max(1000),
      }),
    )
    .min(8)
    .max(12),
});

function uniqueInterviewIds(input: AiQuestionGenerationInput) {
  let ids: string[] = [];
  if (input.interviewRecordIds?.length) {
    ids = input.interviewRecordIds;
  } else if (input.interviewRecordId) {
    ids = [input.interviewRecordId];
  }
  return [...new Set(ids)];
}

async function resolveContext(
  database: WorkspaceDatabasePort,
  organizationId: string,
  input: AiQuestionGenerationInput,
): Promise<GenerationContext> {
  const interviewIds = uniqueInterviewIds(input);
  const rows = interviewIds.length
    ? await database
        .select({
          candidateName: studioInterview.candidateName,
          id: studioInterview.id,
          jobName: jobDescription.name,
          jobPrompt: jobDescription.prompt,
          resumeProfile: studioInterview.resumeProfile,
        })
        .from(studioInterview)
        .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
        .where(
          and(
            eq(studioInterview.organizationId, organizationId),
            inArray(studioInterview.id, interviewIds),
          ),
        )
    : [];
  if (rows.length !== interviewIds.length) {
    throw new BadRequestException("部分所选候选人不存在。", {
      errorCode: "AI_QUESTION_CANDIDATE_NOT_FOUND",
    });
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  const candidates = interviewIds.map((id) => {
    const row = byId.get(id);
    if (!row) {
      throw new BadRequestException("部分所选候选人不存在。", {
        errorCode: "AI_QUESTION_CANDIDATE_NOT_FOUND",
      });
    }
    return {
      candidateName: row.candidateName,
      resumeProfile: row.resumeProfile,
    };
  });

  const requestedJobId = input.jobDescriptionId ?? input.jobDescriptionIds?.[0];
  if (requestedJobId) {
    const [job] = await database
      .select({ name: jobDescription.name, prompt: jobDescription.prompt })
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.id, requestedJobId),
          eq(jobDescription.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!job) {
      throw new BadRequestException("所选岗位不存在。", {
        errorCode: "AI_QUESTION_JOB_DESCRIPTION_NOT_FOUND",
      });
    }
    return { candidates, job };
  }
  const [first] = rows;
  return {
    candidates,
    job: first?.jobName ? { name: first.jobName, prompt: first.jobPrompt } : null,
  };
}

function formatResume(profile: ResumeProfile | null) {
  if (!profile) {
    return "（无简历信息）";
  }
  return [
    `姓名：${profile.name}`,
    profile.targetRoles?.length ? `目标岗位：${profile.targetRoles.join("、")}` : null,
    profile.workYears === null ? null : `工作年限：${profile.workYears} 年`,
    profile.skills?.length ? `技能：${profile.skills.join("、")}` : null,
    profile.workExperiences?.length
      ? `工作经历：${profile.workExperiences.map((item) => `${item.company ?? ""}-${item.role ?? ""}`).join("；")}`
      : null,
    profile.projectExperiences?.length
      ? `项目经历：${profile.projectExperiences.map((item) => item.name ?? "").join("、")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function contextText(context: GenerationContext) {
  const candidates = context.candidates.length
    ? context.candidates
        .map(
          (candidate) =>
            `候选人：${candidate.candidateName}\n${formatResume(candidate.resumeProfile)}`,
        )
        .join("\n\n")
    : "（未指定候选人，请生成岗位通用题目）";
  const job = context.job
    ? `${context.job.name}\n${context.job.prompt ? `岗位说明：${context.job.prompt}` : ""}`
    : "（未指定岗位）";
  return { candidates, job };
}

export async function generateCandidateFormQuestions(
  database: WorkspaceDatabasePort,
  organizationId: string,
  input: AiQuestionGenerationInput,
): Promise<CandidateFormQuestionInput[]> {
  const text = contextText(await resolveContext(database, organizationId, input));
  const prompt = `你是 HR 面试表单设计助手。严格落实 HR 指令，并结合候选人简历与岗位信息生成候选人面试前填写的表单题。\nHR 指令：${input.prompt}\n表单标题：${input.templateTitle || "未命名面试表单"}\n表单说明：${input.templateDescription || "（无）"}\n岗位：${text.job}\n候选人：${text.candidates}\n只输出 JSON：{"questions":[{"type":"single|multi|text","label":"题目","helperText":"提示","required":true,"options":[{"label":"选项","value":"snake_case"}]}]}。single/multi 必须有 2-8 个具体选项；text 的 options 必须为空数组；最多 25 题。`;
  const result = formGenerationSchema.parse(await requestStructuredAiJson(prompt));
  return result.questions.map((question, index) => {
    if (question.type === "text" && question.options.length) {
      throw new BadGatewayException(`填写题「${question.label}」不应包含选项。`, {
        errorCode: "AI_PROVIDER_INVALID_RESPONSE",
      });
    }
    if (question.type !== "text" && (question.options.length < 2 || question.options.length > 8)) {
      throw new BadGatewayException(`题目「${question.label}」的选项数量需在 2 到 8 个之间。`, {
        errorCode: "AI_PROVIDER_INVALID_RESPONSE",
      });
    }
    return {
      displayMode: DEFAULT_DISPLAY_MODE[question.type],
      helperText: question.helperText?.trim() || "",
      id: crypto.randomUUID(),
      label: question.label.trim(),
      options: question.type === "text" ? [] : question.options,
      required: question.required,
      sortOrder: index,
      type: question.type,
    };
  });
}

export async function generateCommunicationQuestions(
  database: WorkspaceDatabasePort,
  organizationId: string,
  input: AiQuestionGenerationInput,
): Promise<InterviewQuestionTemplateQuestionInput[]> {
  const text = contextText(await resolveContext(database, organizationId, input));
  const prompt = `你是技术面试出题助手。严格落实 HR 指令，并结合候选人简历与岗位生成 8-12 道由浅入深、可直接提问的面试题。\nHR 指令：${input.prompt}\n题库标题：${input.templateTitle || "未命名面试题"}\n题库说明：${input.templateDescription || "（无）"}\n岗位：${text.job}\n候选人：${text.candidates}\n只输出 JSON：{"interviewQuestions":[{"difficulty":"easy|medium|hard","evaluationFocus":"考核点","followUpDirections":"追问方向","question":"完整问句"}]}。不得输出答案。`;
  const result = interviewGenerationSchema.parse(await requestStructuredAiJson(prompt));
  return result.interviewQuestions.map((question, index) => ({
    content: question.question,
    difficulty: question.difficulty,
    evaluationFocus: question.evaluationFocus,
    followUpDirections: question.followUpDirections,
    id: crypto.randomUUID(),
    sortOrder: index,
  }));
}
