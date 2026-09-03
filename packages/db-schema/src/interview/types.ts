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
import { resumeScoringFactsSchema } from "../resume-scoring-facts";

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
 * 教育经历的单条记录。
 * A single education-experience entry.
 */
export const resumeEducationExperienceSchema = z.object({
  degree: nullableStringSchema.describe("学位；无法确认时返回 null"),
  educationLevel: nullableStringSchema.describe(
    "学历层次，如专科、本科、硕士、博士；无法确认时返回 null",
  ),
  graduationYear: nullableStringSchema.describe("毕业年份；无法确认时返回 null"),
  major: nullableStringSchema.describe("专业；无法确认时返回 null"),
  period: nullableStringSchema.describe("就读时间范围；无法确认时返回 null"),
  school: nullableStringSchema.describe("学校名称；无法确认时返回 null"),
  summary: nullableStringSchema.describe("教育经历摘要；无法确认时返回 null"),
});

/**
 * 简历画像：候选人的结构化档案，由 LLM 从 PDF 简历中抽取。
 * Resume profile — the candidate's structured dossier, extracted from PDF by the LLM.
 */
export const resumeProfileSchema = z.object({
  age: z.number().nullable().describe("候选人年龄，只有简历明确给出时才填写，否则为 null"),
  educationExperiences: z
    .array(resumeEducationExperienceSchema)
    .optional()
    .describe("教育经历列表，可能包含多个学历；未知时返回空数组"),
  email: nullableStringSchema.describe("候选人邮箱地址，简历中明确给出时填写；无法确认时返回 null"),
  gender: nullableStringSchema.describe('候选人性别；无法从简历中确认时，优先返回"未发现信息"'),
  name: nonEmptyStringSchema.describe(
    '候选人姓名，必须非空；如果简历中无法确认姓名，返回"未发现信息"',
  ),
  personalStrengths: z
    .array(nonEmptyStringSchema)
    .describe("个人优势列表，基于简历归纳，未知时返回空数组"),
  phone: nullableStringSchema.describe(
    "候选人手机号或联系电话，简历中明确给出时填写；无法确认时返回 null",
  ),
  projectExperiences: z
    .array(resumeProjectExperienceSchema)
    .describe("项目经历列表，没有则返回空数组"),
  schools: z.array(nonEmptyStringSchema).describe("毕业院校列表，可能为多个，未知时返回空数组"),
  scoringFacts: resumeScoringFactsSchema
    .optional()
    .describe("首次解析生成的岗位无关评分事实；历史简历可能没有该字段"),
  skills: z.array(nonEmptyStringSchema).describe("掌握技能列表，未知时返回空数组"),
  targetRoles: z.array(nonEmptyStringSchema).describe("求职岗位列表，可能为多个，未知时返回空数组"),
  workExperiences: z.array(resumeWorkExperienceSchema).describe("工作经历列表，没有则返回空数组"),
  workYears: z.number().nullable().describe("工作年限，能明确判断时返回数字，否则为 null"),
});

/**
 * LLM 生成的单道面试题。
 * A single interview question produced by the LLM.
 */
export const interviewQuestionDimensionSchema = z.enum([
  "business",
  "ai_application",
  "project_management",
  "soft_skills",
  "team_management",
]);

export type InterviewQuestionDimension = z.infer<typeof interviewQuestionDimensionSchema>;

export const INTERVIEW_QUESTION_DIMENSION_LABEL = {
  ai_application: "AI应用",
  business: "业务水平",
  project_management: "项目管理",
  soft_skills: "软实力",
  team_management: "团队管理",
} as const satisfies Record<InterviewQuestionDimension, string>;

export const INTERVIEW_QUESTION_DIMENSION_OPTIONS = [
  { label: INTERVIEW_QUESTION_DIMENSION_LABEL.business, value: "business" },
  { label: INTERVIEW_QUESTION_DIMENSION_LABEL.ai_application, value: "ai_application" },
  {
    label: INTERVIEW_QUESTION_DIMENSION_LABEL.project_management,
    value: "project_management",
  },
  { label: INTERVIEW_QUESTION_DIMENSION_LABEL.soft_skills, value: "soft_skills" },
  { label: INTERVIEW_QUESTION_DIMENSION_LABEL.team_management, value: "team_management" },
] as const satisfies readonly { label: string; value: InterviewQuestionDimension }[];

export const generatedInterviewQuestionSchema = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]).describe("题目难度分层"),
  dimension: interviewQuestionDimensionSchema
    .optional()
    .describe("题目考核维度；历史数据缺失时按业务水平处理"),
  evaluationFocus: nonEmptyStringSchema
    .max(500)
    .describe("本题要考核的核心意图或能力点，例如项目真实性、专业深度、沟通表达")
    .nullable()
    .optional(),
  followUpDirections: nonEmptyStringSchema
    .max(1000)
    .describe("面试官可参考的追问方向，围绕候选人回答继续深挖，不要写标准答案")
    .nullable()
    .optional(),
  question: nonEmptyStringSchema.describe(
    "单道面试题，必须与候选人目标岗位和简历相关，并使用候选人的主要语言",
  ),
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
  dimension?: InterviewQuestionDimension;
  evaluationFocus?: string | null;
  followUpDirections?: string | null;
  question: string;
}

/**
 * 简历分析的最终聚合结果：文件名 + 候选人画像 + 一组面试题。
 * Aggregated resume-analysis output: file name + profile + question set.
 */
export interface ResumeAnalysisResult {
  fileName: string;
  resumeProfile: ResumeProfile;
  resumeText: string | null;
  interviewQuestions: InterviewQuestion[];
}
