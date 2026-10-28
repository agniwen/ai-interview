import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  buildJobDescriptionAgentPatch,
  jobDescriptionAgentPatchInputSchema,
  jobDescriptionAgentPatchSchema,
  resolveJobDescriptionAgentReferences,
} from "@app/shared/job-description-agent";
import type {
  JobDescriptionAgentOptions,
  JobDescriptionAgentPageContext,
  JobDescriptionAgentPatchInput,
} from "@app/shared/job-description-agent";
import type { JobDescriptionRecord } from "@app/shared/job-descriptions";
import { subjectAgentPatchRejectionSchema } from "@app/shared/subject-agent-references";

export const JOB_DESCRIPTION_PATCH_TOOL_ID = "propose_job_description_patch";
export const JOB_DESCRIPTION_OPTIONS_TOOL_ID = "list_job_description_options";

const namedOptionSchema = z.object({ id: z.string(), name: z.string() });

const savedJobDescriptionSchema = z.object({
  found: z.boolean(),
  jobDescription: z
    .object({
      allowCrossDepartmentInterviewers: z.boolean(),
      departmentId: z.string(),
      headcount: z.number().nullable(),
      internalCriteria: z.string().nullable(),
      interviewerIds: z.array(z.string()),
      jobWeight: z.string().nullable(),
      name: z.string(),
      priority: z.string().nullable(),
      prompt: z.string(),
      publishedDate: z.string().nullable(),
      recruitingStatus: z.string(),
      referralChannels: z.string().nullable(),
      reportingManagerUserId: z.string().nullable(),
      salaryMaxK: z.string().nullable(),
      salaryMinK: z.string().nullable(),
      targetDate: z.string().nullable(),
    })
    .nullable(),
});

/**
 * 岗位实体会话的工具白名单（ADR-0045）：只读当前岗位、读取编辑页下拉框的可选值、提出表单补丁。
 * 不包含跨岗位或候选人检索，因为回答会持久化给所有能查看该岗位的成员。
 * Subject Thread tool allowlist for a job (ADR-0045): read this job, read the editor's option
 * lists and propose form patches. No library-wide retrieval, because answers are persisted for
 * every viewer of the job.
 */
export function createJobDescriptionSubjectTools({
  loadJobDescription,
  loadOptions,
  pageContext,
}: {
  loadJobDescription: () => Promise<JobDescriptionRecord | null>;
  loadOptions: () => Promise<JobDescriptionAgentOptions>;
  pageContext: JobDescriptionAgentPageContext | null;
}) {
  let optionsPromise: Promise<JobDescriptionAgentOptions> | null = null;
  const readOptions = () => {
    optionsPromise ??= loadOptions();
    return optionsPromise;
  };
  return {
    get_saved_job_description: createTool({
      description:
        "读取当前岗位最近一次保存的内容。页面上可能还有未保存的修改，以本轮提供的“当前表单内容”为准。",
      execute: async () => {
        const record = await loadJobDescription();
        if (!record) {
          return { found: false, jobDescription: null };
        }
        return {
          found: true,
          jobDescription: {
            allowCrossDepartmentInterviewers: record.allowCrossDepartmentInterviewers,
            departmentId: record.departmentId,
            headcount: record.headcount ?? null,
            internalCriteria: record.internalCriteria,
            interviewerIds: record.interviewerIds,
            jobWeight: record.jobWeight ?? null,
            name: record.name,
            priority: record.priority ?? null,
            prompt: record.prompt,
            publishedDate: record.publishedDate ?? null,
            recruitingStatus: record.recruitingStatus,
            referralChannels: record.referralChannels ?? null,
            reportingManagerUserId: record.reportingManagerUserId ?? null,
            salaryMaxK: record.salaryMaxK ?? null,
            salaryMinK: record.salaryMinK ?? null,
            targetDate: record.targetDate ?? null,
          },
        };
      },
      id: "get_saved_job_description",
      inputSchema: z.object({}),
      outputSchema: savedJobDescriptionSchema,
    }),
    [JOB_DESCRIPTION_OPTIONS_TOOL_ID]: createTool({
      description:
        "读取岗位表单下拉框的可选值：部门、面试官（含所属部门）和可作为汇报上级的工作区成员。页面上下文里的部门、面试官、汇报上级都是 ID，需要名称或要修改这些字段时先调用。",
      execute: readOptions,
      id: JOB_DESCRIPTION_OPTIONS_TOOL_ID,
      inputSchema: z.object({}),
      outputSchema: z.object({
        departments: z.array(namedOptionSchema),
        interviewers: z.array(namedOptionSchema.extend({ departmentId: z.string() })),
        members: z.array(namedOptionSchema),
      }),
    }),
    [JOB_DESCRIPTION_PATCH_TOOL_ID]: createTool({
      description:
        "向成员提出岗位表单的修改建议。只填写需要修改的字段，给出完整的新值；部门、面试官、汇报上级使用选项工具返回的 ID，日期格式为 YYYY-MM-DD。summary 用一两句中文说明改了什么。返回 patch_rejected 时按 issues 修正后重新提出。成员确认应用并点击保存后才会生效。",
      execute: async (input: JobDescriptionAgentPatchInput) => {
        const { displayValues, issues } = resolveJobDescriptionAgentReferences(
          input.changes,
          pageContext,
          await readOptions(),
        );
        if (issues.length > 0) {
          return { issues, kind: "patch_rejected" as const };
        }
        return buildJobDescriptionAgentPatch(input, pageContext, displayValues);
      },
      id: JOB_DESCRIPTION_PATCH_TOOL_ID,
      inputSchema: jobDescriptionAgentPatchInputSchema,
      outputSchema: z.union([jobDescriptionAgentPatchSchema, subjectAgentPatchRejectionSchema]),
    }),
  };
}
