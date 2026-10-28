// 岗位编辑页实体会话（ADR-0045）的页面上下文与表单补丁契约。Server 用它校验 agent 输入、
// 解析引用并生成补丁，Web 用它把补丁应用到未保存的岗位表单。补丁覆盖成员能在表单中修改的
// 全部字段；岗位编码由“生成”按钮产生，不由 agent 填写。
// Page-context and form-patch contract for the job-editor Subject Thread (ADR-0045). The server
// validates agent input, resolves references and builds patches; the web app applies them to the
// unsaved job form. Every member-editable field is patchable except the generated job code.
import { z } from "zod";
import { jobDescriptionPrioritySchema, jobWeightSchema } from "./job-descriptions";
import type { JobDescriptionFormValues } from "./job-descriptions";
import {
  buildSubjectAgentBaseFingerprints,
  findSubjectAgentConflicts,
  subjectAgentValuesMatch,
} from "./subject-agent-fingerprint";
import {
  createSubjectAgentReferenceResolution,
  resolveSubjectAgentNamedIds,
  subjectAgentDisplayValuesSchema,
} from "./subject-agent-references";
import type {
  SubjectAgentNamedOption,
  SubjectAgentReferenceResolution,
} from "./subject-agent-references";

export const jobDescriptionAgentFields = [
  "name",
  "departmentId",
  "allowCrossDepartmentInterviewers",
  "interviewerIds",
  "reportingManagerUserId",
  "salaryMinK",
  "salaryMaxK",
  "headcount",
  "jobWeight",
  "priority",
  "targetDate",
  "publishedDate",
  "referralChannels",
  "prompt",
  "internalCriteria",
] as const;
export type JobDescriptionAgentField = (typeof jobDescriptionAgentFields)[number];

const salaryKSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, "薪资格式无效")
  .nullable();
const dateSchema = z.string().date("日期格式应为 YYYY-MM-DD").nullable();

const jobDescriptionAgentFieldSchemas = {
  allowCrossDepartmentInterviewers: z.boolean(),
  departmentId: z.string().trim().min(1),
  headcount: z.number().int().positive().nullable(),
  internalCriteria: z.string().max(10_000).nullable(),
  interviewerIds: z.array(z.string().trim().min(1)).min(1).max(20),
  jobWeight: jobWeightSchema.unwrap(),
  name: z.string().trim().min(1).max(120),
  priority: jobDescriptionPrioritySchema.nullable(),
  prompt: z.string().trim().min(1).max(10_000),
  publishedDate: dateSchema,
  referralChannels: z.string().max(500).nullable(),
  reportingManagerUserId: z.string().trim().min(1).nullable(),
  salaryMaxK: salaryKSchema,
  salaryMinK: salaryKSchema,
  targetDate: dateSchema,
} satisfies Record<JobDescriptionAgentField, z.ZodType>;

export const jobDescriptionAgentFieldLabels = {
  allowCrossDepartmentInterviewers: "允许匹配跨部门面试官",
  departmentId: "所属部门",
  headcount: "招聘人数",
  internalCriteria: "内部标准",
  interviewerIds: "面试官",
  jobWeight: "岗位权重",
  name: "岗位名称",
  priority: "优先级",
  prompt: "岗位 JD",
  publishedDate: "发布日期",
  referralChannels: "简历推荐渠道",
  reportingManagerUserId: "汇报上级",
  salaryMaxK: "薪资上限",
  salaryMinK: "薪资下限",
  targetDate: "目标日期",
} satisfies Record<JobDescriptionAgentField, string>;

/** 发送人当前未保存的岗位表单内容，只用于本轮推理，不持久化。引用字段为 ID。 */
export const jobDescriptionAgentPageContextSchema = z
  .object({
    allowCrossDepartmentInterviewers: z.boolean(),
    departmentId: z.string().max(200),
    headcount: z.number().int().nullable(),
    internalCriteria: z.string().max(10_000).nullable(),
    interviewerIds: z.array(z.string().max(200)).max(40),
    jobWeight: z.string().max(32).nullable(),
    name: z.string().max(200),
    priority: jobDescriptionPrioritySchema.nullable(),
    prompt: z.string().max(12_000),
    publishedDate: z.string().max(32).nullable(),
    referralChannels: z.string().max(600).nullable(),
    reportingManagerUserId: z.string().max(200).nullable(),
    salaryMaxK: z.string().max(32).nullable(),
    salaryMinK: z.string().max(32).nullable(),
    targetDate: z.string().max(32).nullable(),
  })
  .strict();
export type JobDescriptionAgentPageContext = z.infer<typeof jobDescriptionAgentPageContextSchema>;

/** agent 提出的修改：只列出要改的字段，并附带给成员看的说明。 */
export const jobDescriptionAgentPatchInputSchema = z
  .object({
    changes: z
      .object(jobDescriptionAgentFieldSchemas)
      .partial()
      .strict()
      .refine((changes) => Object.keys(changes).length > 0, "至少需要修改一个字段"),
    summary: z.string().trim().min(1).max(300),
  })
  .strict();
export type JobDescriptionAgentPatchInput = z.infer<typeof jobDescriptionAgentPatchInputSchema>;
export type JobDescriptionAgentChanges = JobDescriptionAgentPatchInput["changes"];

/**
 * 持久化在工具结果中的补丁；baseFingerprints 记录生成时被修改字段的原值指纹，
 * displayValues 是引用字段的展示名称（如部门名）。
 */
export const jobDescriptionAgentPatchSchema = jobDescriptionAgentPatchInputSchema.extend({
  baseFingerprints: z.record(z.string(), z.string()),
  displayValues: subjectAgentDisplayValuesSchema.optional(),
  kind: z.literal("job_description_patch"),
});
export type JobDescriptionAgentPatch = z.infer<typeof jobDescriptionAgentPatchSchema>;

/** 岗位表单引用字段的可选值，与编辑页下拉框的数据来源一致。 */
export interface JobDescriptionAgentOptions {
  departments: SubjectAgentNamedOption[];
  interviewers: (SubjectAgentNamedOption & { departmentId: string })[];
  members: SubjectAgentNamedOption[];
}

/** 应用补丁时写入表单的值，以及撤销所需的原值。 */
export interface JobDescriptionAgentChangeSet {
  next: Partial<JobDescriptionAgentPageContext>;
  previous: Partial<JobDescriptionAgentPageContext>;
}

function changedFields(changes: JobDescriptionAgentChanges): JobDescriptionAgentField[] {
  return jobDescriptionAgentFields.filter((field) => changes[field] !== undefined);
}

export function pickJobDescriptionAgentPageContext(
  values: JobDescriptionFormValues,
): JobDescriptionAgentPageContext {
  return {
    allowCrossDepartmentInterviewers: values.allowCrossDepartmentInterviewers,
    departmentId: values.departmentId,
    headcount: values.headcount ?? null,
    internalCriteria: values.internalCriteria ?? null,
    interviewerIds: [...values.interviewerIds],
    jobWeight: values.jobWeight ?? null,
    name: values.name,
    priority: values.priority ?? null,
    prompt: values.prompt,
    publishedDate: values.publishedDate ?? null,
    referralChannels: values.referralChannels ?? null,
    reportingManagerUserId: values.reportingManagerUserId ?? null,
    salaryMaxK: values.salaryMaxK ?? null,
    salaryMinK: values.salaryMinK ?? null,
    targetDate: values.targetDate ?? null,
  };
}

function checkInterviewerDepartments(
  changes: JobDescriptionAgentChanges,
  pageContext: JobDescriptionAgentPageContext | null,
  options: JobDescriptionAgentOptions,
  resolution: SubjectAgentReferenceResolution,
): void {
  const touchesAssignment =
    changes.departmentId !== undefined ||
    changes.interviewerIds !== undefined ||
    changes.allowCrossDepartmentInterviewers !== undefined;
  if (!touchesAssignment) {
    return;
  }
  const allowCross =
    changes.allowCrossDepartmentInterviewers ??
    pageContext?.allowCrossDepartmentInterviewers ??
    false;
  const departmentId = changes.departmentId ?? pageContext?.departmentId ?? "";
  const interviewerIds = changes.interviewerIds ?? pageContext?.interviewerIds ?? [];
  // 部门无效时已单独报错，不再重复报告面试官不匹配。
  const departmentKnown = options.departments.some((item) => item.id === departmentId);
  if (allowCross || !departmentKnown) {
    return;
  }
  const outside = options.interviewers.filter(
    (item) => interviewerIds.includes(item.id) && item.departmentId !== departmentId,
  );
  if (outside.length > 0) {
    resolution.issues.push(
      `面试官 ${outside.map((item) => item.name).join("、")} 不属于所属部门。请改选该部门的面试官，或同时开启“允许匹配跨部门面试官”。`,
    );
  }
}

/**
 * 校验补丁中的引用字段并解析展示名称：部门、面试官、汇报上级必须存在；未允许跨部门时，
 * 修改后的面试官必须属于修改后的所属部门。薪资区间也按保存规则检查。
 * Validates reference fields against the editor's options and resolves their display names.
 */
export function resolveJobDescriptionAgentReferences(
  changes: JobDescriptionAgentChanges,
  pageContext: JobDescriptionAgentPageContext | null,
  options: JobDescriptionAgentOptions,
): SubjectAgentReferenceResolution {
  const resolution = createSubjectAgentReferenceResolution();
  if (changes.departmentId !== undefined) {
    resolveSubjectAgentNamedIds({
      field: "departmentId",
      ids: [changes.departmentId],
      label: "所属部门",
      options: options.departments,
      resolution,
    });
  }
  if (changes.interviewerIds !== undefined) {
    resolveSubjectAgentNamedIds({
      field: "interviewerIds",
      ids: changes.interviewerIds,
      label: "面试官",
      options: options.interviewers,
      resolution,
    });
  }
  if (changes.reportingManagerUserId) {
    resolveSubjectAgentNamedIds({
      field: "reportingManagerUserId",
      ids: [changes.reportingManagerUserId],
      label: "汇报上级",
      options: options.members,
      resolution,
    });
  }
  checkInterviewerDepartments(changes, pageContext, options, resolution);
  const salaryMin = changes.salaryMinK === undefined ? pageContext?.salaryMinK : changes.salaryMinK;
  const salaryMax = changes.salaryMaxK === undefined ? pageContext?.salaryMaxK : changes.salaryMaxK;
  if (salaryMin && salaryMax && Number(salaryMin) > Number(salaryMax)) {
    resolution.issues.push("薪资上限不能低于下限。");
  }
  return resolution;
}

export function buildJobDescriptionAgentPatch(
  input: JobDescriptionAgentPatchInput,
  pageContext: JobDescriptionAgentPageContext | null,
  displayValues: Record<string, string> = {},
): JobDescriptionAgentPatch {
  const baseFingerprints = pageContext
    ? buildSubjectAgentBaseFingerprints(changedFields(input.changes), (field) => pageContext[field])
    : {};
  return { ...input, baseFingerprints, displayValues, kind: "job_description_patch" };
}

/** 补丁生成后被其他人或本人改过的字段；补丁未记录原值时视为无冲突。 */
export function findJobDescriptionAgentPatchConflicts(
  patch: JobDescriptionAgentPatch,
  current: JobDescriptionAgentPageContext,
): JobDescriptionAgentField[] {
  return findSubjectAgentConflicts(
    changedFields(patch.changes),
    patch.baseFingerprints,
    (field) => current[field],
  );
}

function copyField<K extends JobDescriptionAgentField>(
  target: Partial<JobDescriptionAgentPageContext>,
  source: JobDescriptionAgentPageContext,
  field: K,
): void {
  target[field] = source[field];
}

export function applyJobDescriptionAgentChanges(
  changes: JobDescriptionAgentChanges,
  current: JobDescriptionAgentPageContext,
): JobDescriptionAgentChangeSet {
  const previous: Partial<JobDescriptionAgentPageContext> = {};
  for (const field of changedFields(changes)) {
    copyField(previous, current, field);
  }
  return { next: { ...changes }, previous };
}

/** 补丁修改的字段在给定表单内容中是否都已是补丁的值。 */
export function jobDescriptionAgentPatchMatches(
  patch: JobDescriptionAgentPatch,
  values: JobDescriptionAgentPageContext,
): boolean {
  return subjectAgentValuesMatch(
    changedFields(patch.changes),
    (field) => patch.changes[field] ?? null,
    (field) => values[field],
  );
}
