import type { ResumeProfile } from "@app/db-schema/interview/types";
import type { ResumeProfileEditInput } from "@app/shared/resume-profile-edit";

/**
 * 简历画像编辑表单的草稿模型。
 * 表单内全部用字符串承载（空串 = 未知），提交时再转回画像的 null / number 语义。
 * AI 用「未发现信息」表示无法确认，草稿里按空值展示，避免 HR 误以为是真实内容。
 *
 * Draft model for the resume profile editor. Inputs hold strings (empty = unknown)
 * and convert back to the profile's null / number semantics on submit. The AI
 * placeholder "未发现信息" is shown as empty so it is not mistaken for real content.
 */

const AI_UNKNOWN_PLACEHOLDER = "未发现信息";
const LINE_BREAK_PATTERN = /\r?\n/u;

export interface WorkExperienceDraft {
  key: string;
  company: string;
  period: string;
  role: string;
  summary: string;
}

export interface ProjectExperienceDraft {
  key: string;
  name: string;
  period: string;
  role: string;
  summary: string;
  techStack: string[];
}

export interface EducationExperienceDraft {
  key: string;
  degree: string;
  educationLevel: string;
  graduationYear: string;
  major: string;
  period: string;
  school: string;
  summary: string;
}

export interface ResumeProfileDraft {
  age: string;
  educationExperiences: EducationExperienceDraft[];
  email: string;
  gender: string;
  name: string;
  /** 每行一条个人优势。One personal strength per line. */
  personalStrengths: string;
  phone: string;
  projectExperiences: ProjectExperienceDraft[];
  schools: string[];
  skills: string[];
  targetRoles: string[];
  workExperiences: WorkExperienceDraft[];
  workYears: string;
}

function createDraftKey(): string {
  return crypto.randomUUID();
}

function toText(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed === AI_UNKNOWN_PLACEHOLDER ? "" : trimmed;
}

function toTags(values: readonly string[] | null | undefined): string[] {
  return (values ?? []).map(toText).filter((value) => value.length > 0);
}

function toNumberText(value: number | null | undefined): string {
  return Number.isFinite(value) ? String(value) : "";
}

export function createWorkExperienceDraft(): WorkExperienceDraft {
  return { company: "", key: createDraftKey(), period: "", role: "", summary: "" };
}

export function createProjectExperienceDraft(): ProjectExperienceDraft {
  return { key: createDraftKey(), name: "", period: "", role: "", summary: "", techStack: [] };
}

export function createEducationExperienceDraft(): EducationExperienceDraft {
  return {
    degree: "",
    educationLevel: "",
    graduationYear: "",
    key: createDraftKey(),
    major: "",
    period: "",
    school: "",
    summary: "",
  };
}

export function createResumeProfileDraft(profile: ResumeProfile): ResumeProfileDraft {
  return {
    age: toNumberText(profile.age),
    educationExperiences: (profile.educationExperiences ?? []).map((entry) => ({
      degree: toText(entry.degree),
      educationLevel: toText(entry.educationLevel),
      graduationYear: toText(entry.graduationYear),
      key: createDraftKey(),
      major: toText(entry.major),
      period: toText(entry.period),
      school: toText(entry.school),
      summary: toText(entry.summary),
    })),
    email: toText(profile.email),
    gender: toText(profile.gender),
    name: toText(profile.name),
    personalStrengths: toTags(profile.personalStrengths).join("\n"),
    phone: toText(profile.phone),
    projectExperiences: profile.projectExperiences.map((entry) => ({
      key: createDraftKey(),
      name: toText(entry.name),
      period: toText(entry.period),
      role: toText(entry.role),
      summary: toText(entry.summary),
      techStack: toTags(entry.techStack),
    })),
    schools: toTags(profile.schools),
    skills: toTags(profile.skills),
    targetRoles: toTags(profile.targetRoles),
    workExperiences: profile.workExperiences.map((entry) => ({
      company: toText(entry.company),
      key: createDraftKey(),
      period: toText(entry.period),
      role: toText(entry.role),
      summary: toText(entry.summary),
    })),
    workYears: toNumberText(profile.workYears),
  };
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function hasAnyText(texts: readonly string[], lists: readonly (readonly string[])[] = []): boolean {
  return texts.some((text) => text.trim().length > 0) || lists.some((list) => list.length > 0);
}

/**
 * 草稿 → 写入契约。全空的经历条目会被丢弃；数字字段无法解析时返回 NaN，交给 schema 报错。
 * Draft → write contract. Fully empty entries are dropped; unparsable numbers become
 * NaN so the shared schema reports them.
 */
export function toResumeProfileEditInput(draft: ResumeProfileDraft): ResumeProfileEditInput {
  return {
    age: parseOptionalNumber(draft.age),
    educationExperiences: draft.educationExperiences
      .filter((entry) =>
        hasAnyText([
          entry.degree,
          entry.educationLevel,
          entry.graduationYear,
          entry.major,
          entry.period,
          entry.school,
          entry.summary,
        ]),
      )
      .map((entry) => ({
        degree: nullableText(entry.degree),
        educationLevel: nullableText(entry.educationLevel),
        graduationYear: nullableText(entry.graduationYear),
        major: nullableText(entry.major),
        period: nullableText(entry.period),
        school: nullableText(entry.school),
        summary: nullableText(entry.summary),
      })),
    email: nullableText(draft.email),
    gender: nullableText(draft.gender),
    name: draft.name.trim(),
    personalStrengths: draft.personalStrengths
      .split(LINE_BREAK_PATTERN)
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
    phone: nullableText(draft.phone),
    projectExperiences: draft.projectExperiences
      .filter((entry) =>
        hasAnyText([entry.name, entry.period, entry.role, entry.summary], [entry.techStack]),
      )
      .map((entry) => ({
        name: nullableText(entry.name),
        period: nullableText(entry.period),
        role: nullableText(entry.role),
        summary: nullableText(entry.summary),
        techStack: entry.techStack,
      })),
    schools: draft.schools,
    skills: draft.skills,
    targetRoles: draft.targetRoles,
    workExperiences: draft.workExperiences
      .filter((entry) => hasAnyText([entry.company, entry.period, entry.role, entry.summary]))
      .map((entry) => ({
        company: nullableText(entry.company),
        period: nullableText(entry.period),
        role: nullableText(entry.role),
        summary: nullableText(entry.summary),
      })),
    workYears: parseOptionalNumber(draft.workYears),
  };
}

/**
 * 只有内容真的变化才提交画像：未改动时提交会把「未发现信息」规范成 null，
 * 进而改变评价输入哈希并触发不必要的重新评价。
 * Only submit when content changed; an untouched submit would normalize "未发现信息"
 * to null, change the evaluation input hash, and trigger a needless reassessment.
 */
export function isResumeProfileDraftChanged(
  initial: ResumeProfileDraft,
  current: ResumeProfileDraft,
): boolean {
  return (
    JSON.stringify(toResumeProfileEditInput(initial)) !==
    JSON.stringify(toResumeProfileEditInput(current))
  );
}
