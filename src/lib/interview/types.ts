import { z } from 'zod';

const nonEmptyStringSchema = z.string().trim().min(1);
const nullableStringSchema = z.string().trim().nullable();

export const resumeWorkExperienceSchema = z.object({
  company: nullableStringSchema.describe('工作单位名称；无法从简历中确认时，优先返回“未发现信息”'),
  role: nullableStringSchema.describe('岗位名称；无法从简历中确认时，优先返回“未发现信息”'),
  period: nullableStringSchema.describe('在职时间范围；无法从简历中确认时，优先返回“未发现信息”'),
  summary: nullableStringSchema.describe('该段工作经历的简要描述；无法从简历中确认时，优先返回“未发现信息”'),
});

export const resumeProjectExperienceSchema = z.object({
  name: nullableStringSchema.describe('项目名称；无法从简历中确认时，优先返回“未发现信息”'),
  role: nullableStringSchema.describe('在项目中的角色；无法从简历中确认时，优先返回“未发现信息”'),
  period: nullableStringSchema.describe('项目时间范围；无法从简历中确认时，优先返回“未发现信息”'),
  techStack: z.array(nonEmptyStringSchema).describe('项目使用的技术栈，未知时返回空数组'),
  summary: nullableStringSchema.describe('项目简要描述；无法从简历中确认时，优先返回“未发现信息”'),
});

export const resumeProfileSchema = z.object({
  name: nonEmptyStringSchema.describe('候选人姓名，必须非空；如果简历中无法确认姓名，返回“未发现信息”'),
  age: z.number().nullable().describe('候选人年龄，只有简历明确给出时才填写，否则为 null'),
  gender: nullableStringSchema.describe('候选人性别；无法从简历中确认时，优先返回“未发现信息”'),
  targetRoles: z.array(nonEmptyStringSchema).describe('求职岗位列表，可能为多个，未知时返回空数组'),
  workYears: z.number().nullable().describe('工作年限，能明确判断时返回数字，否则为 null'),
  skills: z.array(nonEmptyStringSchema).describe('掌握技能列表，未知时返回空数组'),
  schools: z.array(nonEmptyStringSchema).describe('毕业院校列表，可能为多个，未知时返回空数组'),
  workExperiences: z.array(resumeWorkExperienceSchema).describe('工作经历列表，没有则返回空数组'),
  projectExperiences: z.array(resumeProjectExperienceSchema).describe('项目经历列表，没有则返回空数组'),
  personalStrengths: z.array(nonEmptyStringSchema).describe('个人优势列表，基于简历归纳，未知时返回空数组'),
});

export const generatedInterviewQuestionSchema = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']).describe('题目难度分层'),
  question: nonEmptyStringSchema.describe('单道中文面试题，必须与候选人目标岗位和简历相关'),
});

export const generatedInterviewQuestionsSchema = z.object({
  interviewQuestions: z.array(generatedInterviewQuestionSchema).length(10).describe('共 10 道由简入深的面试题'),
});

export type ResumeProfile = z.infer<typeof resumeProfileSchema>;
export type GeneratedInterviewQuestion = z.infer<typeof generatedInterviewQuestionSchema>;

export interface InterviewQuestion {
  order: number
  difficulty: GeneratedInterviewQuestion['difficulty']
  question: string
}

export interface ResumeAnalysisResult {
  fileName: string
  resumeProfile: ResumeProfile
  interviewQuestions: InterviewQuestion[]
}
