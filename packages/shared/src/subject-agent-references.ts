// 实体会话补丁中的引用字段（ADR-0045）：部门、面试官、成员、绑定岗位等只能取工作区里已有的记录。
// Server 在生成补丁前用这里的函数校验引用并解析出展示名称；校验不通过时返回拒绝结果，
// 让 agent 读到原因后修正，而不是把无效 ID 填进表单。
// Reference fields in Subject Thread patches (ADR-0045). The server validates references and
// resolves display names before building a patch; invalid references produce a rejection the
// agent can read and correct instead of writing unknown ids into the form.
import { z } from "zod";

/** 补丁被拒绝：issues 是给 agent 看的中文原因。 */
export const subjectAgentPatchRejectionSchema = z.object({
  issues: z.array(z.string()).min(1),
  kind: z.literal("patch_rejected"),
});
export type SubjectAgentPatchRejection = z.infer<typeof subjectAgentPatchRejectionSchema>;

/** 引用字段的展示文本（如部门名、面试官姓名），按字段名索引。 */
export const subjectAgentDisplayValuesSchema = z.record(z.string(), z.string());
export type SubjectAgentDisplayValues = z.infer<typeof subjectAgentDisplayValuesSchema>;

export interface SubjectAgentNamedOption {
  id: string;
  name: string;
}

/** 引用解析结果：展示文本与校验问题；issues 为空表示可以生成补丁。 */
export interface SubjectAgentReferenceResolution {
  displayValues: SubjectAgentDisplayValues;
  issues: string[];
}

export function createSubjectAgentReferenceResolution(): SubjectAgentReferenceResolution {
  return { displayValues: {}, issues: [] };
}

/** 把一组 ID 解析为名称；不存在的 ID 记为问题。 */
export function resolveSubjectAgentNamedIds({
  field,
  ids,
  label,
  options,
  resolution,
}: {
  field: string;
  ids: readonly string[];
  label: string;
  options: readonly SubjectAgentNamedOption[];
  resolution: SubjectAgentReferenceResolution;
}): void {
  const names = new Map(options.map((option) => [option.id, option.name]));
  const missing = ids.filter((id) => !names.has(id));
  if (missing.length > 0) {
    resolution.issues.push(
      `${label}中存在无效 ID：${missing.join("、")}。请先调用选项工具获取可选值。`,
    );
    return;
  }
  resolution.displayValues[field] = ids.map((id) => names.get(id) ?? id).join("、");
}

// ---- 沟通题 / 表单题的适用范围与绑定岗位 ----

export const subjectAgentJobScopeSchema = z.enum(["global", "job_description"]);
export type SubjectAgentJobScope = z.infer<typeof subjectAgentJobScopeSchema>;

export const SUBJECT_AGENT_JOB_SCOPE_LABELS = {
  global: "全局（所有面试）",
  job_description: "指定在招岗位",
} satisfies Record<SubjectAgentJobScope, string>;

/** 补丁可修改的适用范围字段，与模板保存时的限制一致。 */
export const subjectAgentJobBindingChangeFields = {
  jobDescriptionIds: z.array(z.string().trim().min(1)).max(50),
  scope: subjectAgentJobScopeSchema,
};

export interface SubjectAgentJobBinding {
  jobDescriptionIds: string[];
  scope: SubjectAgentJobScope;
}

/** 与编辑器行为一致：改为全局时清空绑定岗位，只给出岗位时切换为“指定在招岗位”。 */
function normalizeJobBindingChanges(
  changes: Partial<SubjectAgentJobBinding>,
  current: SubjectAgentJobBinding | null,
): Partial<SubjectAgentJobBinding> {
  const normalized: Partial<SubjectAgentJobBinding> = {};
  if (changes.scope !== undefined) {
    normalized.scope = changes.scope;
  }
  if (changes.jobDescriptionIds !== undefined) {
    normalized.jobDescriptionIds = [...new Set(changes.jobDescriptionIds)];
  }
  const onlyJobsGiven =
    normalized.scope === undefined && (normalized.jobDescriptionIds?.length ?? 0) > 0;
  if (normalized.scope === "global") {
    normalized.jobDescriptionIds = [];
  } else if (onlyJobsGiven && current?.scope !== "job_description") {
    normalized.scope = "job_description";
  }
  return normalized;
}

/**
 * 规范化并校验补丁里的适用范围：最终为“指定在招岗位”时至少要有一个岗位，绑定岗位必须是
 * 可选岗位。返回规范化后的修改。
 * Normalizes scope changes the same way the editor does and validates the resulting binding.
 */
export function resolveSubjectAgentJobBinding(
  changes: Partial<SubjectAgentJobBinding>,
  current: SubjectAgentJobBinding | null,
  jobDescriptions: readonly SubjectAgentNamedOption[],
  resolution: SubjectAgentReferenceResolution,
): Partial<SubjectAgentJobBinding> {
  if (changes.scope === undefined && changes.jobDescriptionIds === undefined) {
    return {};
  }
  const normalized = normalizeJobBindingChanges(changes, current);
  const scope = normalized.scope ?? current?.scope ?? "global";
  const ids = normalized.jobDescriptionIds ?? current?.jobDescriptionIds ?? [];
  if (scope === "job_description" && ids.length === 0) {
    resolution.issues.push("作用范围为“指定在招岗位”时，绑定岗位至少需要一个。");
  }
  if (normalized.scope !== undefined) {
    resolution.displayValues.scope = SUBJECT_AGENT_JOB_SCOPE_LABELS[normalized.scope];
  }
  if (normalized.jobDescriptionIds !== undefined) {
    resolveSubjectAgentNamedIds({
      field: "jobDescriptionIds",
      ids: normalized.jobDescriptionIds,
      label: "绑定岗位",
      options: jobDescriptions,
      resolution,
    });
  }
  return normalized;
}
