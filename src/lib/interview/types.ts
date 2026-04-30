/**
 * 面试核心 Zod Schema 与推导类型。
 * Core Zod schemas and inferred types for the interview domain.
 *
 * 既是给 LLM 的"返回结构契约"（通过 `.describe()` 写入的中文是 prompt 的一部分），
 * 也是前端在表单 / 渲染时的类型源。改动 schema 时同时影响 LLM 调用与 UI，
 * 务必跑全量 typecheck 验证。
 *
 * These schemas double as the LLM "response contract" (the Chinese `.describe()`
 * texts are part of the prompt) and as the source of truth for frontend forms /
 * rendering. Schema changes affect both LLM calls and UI — run a full typecheck.
 */

import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);
const nullableStringSchema = z.string().trim().nullable();

/**
 * 工作经历的单条记录。
 * A single work-experience entry.
 */
export const resumeWorkExperienceSchema = z.object({
  company: nullableStringSchema.describe('工作单位名称；无法从简历中确认时，优先返回"未发现信息"'),
  period: nullableStringSchema.describe('在职时间范围；无法从简历中确认时，优先返回"未发现信息"'),
  role: nullableStringSchema.describe('岗位名称；无法从简历中确认时，优先返回"未发现信息"'),
  summary: nullableStringSchema.describe(
    '该段工作经历的简要描述；无法从简历中确认时，优先返回"未发现信息"',
  ),
});

/**
 * 项目经历的单条记录。
 * A single project-experience entry.
 */
export const resumeProjectExperienceSchema = z.object({
  name: nullableStringSchema.describe('项目名称；无法从简历中确认时，优先返回"未发现信息"'),
  period: nullableStringSchema.describe('项目时间范围；无法从简历中确认时，优先返回"未发现信息"'),
  role: nullableStringSchema.describe('在项目中的角色；无法从简历中确认时，优先返回"未发现信息"'),
  summary: nullableStringSchema.describe('项目简要描述；无法从简历中确认时，优先返回"未发现信息"'),
  techStack: z.array(nonEmptyStringSchema).describe("项目使用的技术栈，未知时返回空数组"),
});

/**
 * 简历画像：候选人的结构化档案，由 LLM 从 PDF 简历中抽取。
 * Resume profile — the candidate's structured dossier, extracted from PDF by the LLM.
 */
export const resumeProfileSchema = z.object({
  age: z.number().nullable().describe("候选人年龄，只有简历明确给出时才填写，否则为 null"),
  gender: nullableStringSchema.describe('候选人性别；无法从简历中确认时，优先返回"未发现信息"'),
  name: nonEmptyStringSchema.describe(
    '候选人姓名，必须非空；如果简历中无法确认姓名，返回"未发现信息"',
  ),
  personalStrengths: z
    .array(nonEmptyStringSchema)
    .describe("个人优势列表，基于简历归纳，未知时返回空数组"),
  projectExperiences: z
    .array(resumeProjectExperienceSchema)
    .describe("项目经历列表，没有则返回空数组"),
  schools: z.array(nonEmptyStringSchema).describe("毕业院校列表，可能为多个，未知时返回空数组"),
  skills: z.array(nonEmptyStringSchema).describe("掌握技能列表，未知时返回空数组"),
  targetRoles: z.array(nonEmptyStringSchema).describe("求职岗位列表，可能为多个，未知时返回空数组"),
  workExperiences: z.array(resumeWorkExperienceSchema).describe("工作经历列表，没有则返回空数组"),
  workYears: z.number().nullable().describe("工作年限，能明确判断时返回数字，否则为 null"),
});

/**
 * LLM 生成的单道面试题。
 * A single interview question produced by the LLM.
 */
export const generatedInterviewQuestionSchema = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]).describe("题目难度分层"),
  question: nonEmptyStringSchema.describe("单道中文面试题，必须与候选人目标岗位和简历相关"),
});

/**
 * 一次性返回的 10 道面试题集合（固定长度，便于 UI 展示）。
 * Fixed-length set of 10 generated interview questions (eases UI rendering).
 */
export const generatedInterviewQuestionsSchema = z.object({
  interviewQuestions: z
    .array(generatedInterviewQuestionSchema)
    .length(10)
    .describe("共 10 道由简入深的面试题"),
});

/**
 * 推导类型：与 schema 同源，避免与运行时定义漂移。
 * Inferred types tied to the schemas above so they cannot drift apart.
 */
export type ResumeProfile = z.infer<typeof resumeProfileSchema>;
export type GeneratedInterviewQuestion = z.infer<typeof generatedInterviewQuestionSchema>;

/**
 * 持久化后的面试题：在 LLM 输出基础上额外加上展示顺序 `order`。
 * A persisted interview question — adds a display `order` on top of the LLM output.
 */
export interface InterviewQuestion {
  order: number;
  difficulty: GeneratedInterviewQuestion["difficulty"];
  question: string;
}

/**
 * 简历分析的最终聚合结果：文件名 + 候选人画像 + 一组面试题。
 * Aggregated resume-analysis output: file name + profile + question set.
 */
export interface ResumeAnalysisResult {
  fileName: string;
  resumeProfile: ResumeProfile;
  interviewQuestions: InterviewQuestion[];
}
