import { z } from "zod";
import type { ResumeProfile } from "@app/db-schema/interview/types";

/**
 * 人工修正简历画像（Resume Profile）的写入契约。
 * AI 抽取可能出错，招聘台与人才库允许 HR 修正结构化事实；评分事实（scoringFacts）
 * 属于派生数据，不在可编辑范围内，合并时保留原值。
 *
 * Write contract for manually correcting a Resume Profile. Derived scoring facts
 * are not editable and are preserved when merging the edit.
 */

const SHORT_TEXT_MAX = 120;
const PERIOD_MAX = 60;
const SUMMARY_MAX = 4000;
const LIST_ITEM_MAX = 120;
const TAG_LIST_MAX = 100;
const ENTRY_LIST_MAX = 50;

function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label}不能超过 ${max} 个字符`)
    .nullable()
    .transform((value) => value || null);
}

function tagList(label: string) {
  return z
    .array(
      z.string().trim().min(1).max(LIST_ITEM_MAX, `${label}单项不能超过 ${LIST_ITEM_MAX} 个字符`),
    )
    .max(TAG_LIST_MAX, `${label}最多 ${TAG_LIST_MAX} 项`);
}

export const resumeWorkExperienceEditSchema = z.object({
  company: optionalText(SHORT_TEXT_MAX, "工作单位"),
  period: optionalText(PERIOD_MAX, "在职时间"),
  role: optionalText(SHORT_TEXT_MAX, "岗位名称"),
  summary: optionalText(SUMMARY_MAX, "工作描述"),
});

export const resumeProjectExperienceEditSchema = z.object({
  name: optionalText(SHORT_TEXT_MAX, "项目名称"),
  period: optionalText(PERIOD_MAX, "项目时间"),
  role: optionalText(SHORT_TEXT_MAX, "项目角色"),
  summary: optionalText(SUMMARY_MAX, "项目描述"),
  techStack: tagList("技术栈"),
});

export const resumeEducationExperienceEditSchema = z.object({
  degree: optionalText(SHORT_TEXT_MAX, "学位"),
  educationLevel: optionalText(SHORT_TEXT_MAX, "学历"),
  graduationYear: optionalText(PERIOD_MAX, "毕业年份"),
  major: optionalText(SHORT_TEXT_MAX, "专业"),
  period: optionalText(PERIOD_MAX, "就读时间"),
  school: optionalText(SHORT_TEXT_MAX, "学校"),
  summary: optionalText(SUMMARY_MAX, "教育经历描述"),
});

export const resumeProfileEditSchema = z.object({
  age: z.number().int("年龄需为整数").min(0, "年龄无效").max(120, "年龄无效").nullable(),
  educationExperiences: z
    .array(resumeEducationExperienceEditSchema)
    .max(ENTRY_LIST_MAX, `教育经历最多 ${ENTRY_LIST_MAX} 段`),
  email: optionalText(200, "邮箱"),
  gender: optionalText(40, "性别"),
  name: z.string().trim().min(1, "请填写候选人姓名").max(SHORT_TEXT_MAX, "候选人姓名过长"),
  personalStrengths: tagList("个人优势"),
  phone: optionalText(40, "联系电话"),
  projectExperiences: z
    .array(resumeProjectExperienceEditSchema)
    .max(ENTRY_LIST_MAX, `项目经历最多 ${ENTRY_LIST_MAX} 段`),
  schools: tagList("毕业院校"),
  skills: tagList("技能"),
  targetRoles: tagList("求职意向"),
  workExperiences: z
    .array(resumeWorkExperienceEditSchema)
    .max(ENTRY_LIST_MAX, `工作经历最多 ${ENTRY_LIST_MAX} 段`),
  workYears: z.number().min(0, "工作年限无效").max(80, "工作年限无效").nullable(),
});

export type ResumeProfileEditInput = z.input<typeof resumeProfileEditSchema>;
export type ResumeProfileEdit = z.output<typeof resumeProfileEditSchema>;

/** 把人工修正合并回原画像；评分事实等不可编辑字段保持原值。 */
export function applyResumeProfileEdit(
  existing: ResumeProfile | null,
  edit: ResumeProfileEdit,
): ResumeProfile {
  return {
    ...existing,
    ...edit,
  };
}

/** 从画像里取出可编辑部分，作为编辑表单的初始值。 */
export function toResumeProfileEditInput(profile: ResumeProfile): ResumeProfileEditInput {
  return {
    age: profile.age,
    educationExperiences: profile.educationExperiences ?? [],
    email: profile.email,
    gender: profile.gender,
    name: profile.name,
    personalStrengths: profile.personalStrengths,
    phone: profile.phone,
    projectExperiences: profile.projectExperiences,
    schools: profile.schools,
    skills: profile.skills,
    targetRoles: profile.targetRoles,
    workExperiences: profile.workExperiences,
    workYears: profile.workYears,
  };
}
