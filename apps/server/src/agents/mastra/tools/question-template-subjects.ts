import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { CandidateFormTemplateRecord } from "@app/db-schema/candidate-forms";
import type { InterviewQuestionTemplateRecord } from "@app/db-schema/interview-question-templates";
import {
  buildCandidateFormAgentPatch,
  candidateFormAgentPatchInputSchema,
  candidateFormAgentPatchSchema,
} from "@app/shared/candidate-form-agent";
import type {
  CandidateFormAgentPageContext,
  CandidateFormAgentPatchInput,
} from "@app/shared/candidate-form-agent";
import {
  buildInterviewQuestionAgentPatch,
  interviewQuestionAgentPatchInputSchema,
  interviewQuestionAgentPatchSchema,
} from "@app/shared/interview-question-agent";
import type {
  InterviewQuestionAgentPageContext,
  InterviewQuestionAgentPatchInput,
} from "@app/shared/interview-question-agent";
import {
  createSubjectAgentReferenceResolution,
  resolveSubjectAgentJobBinding,
  subjectAgentPatchRejectionSchema,
} from "@app/shared/subject-agent-references";
import type {
  SubjectAgentJobBinding,
  SubjectAgentNamedOption,
  SubjectAgentPatchRejection,
  SubjectAgentReferenceResolution,
} from "@app/shared/subject-agent-references";

export const INTERVIEW_QUESTION_PATCH_TOOL_ID = "propose_interview_question_patch";
export const CANDIDATE_FORM_PATCH_TOOL_ID = "propose_candidate_form_patch";
export const BINDABLE_JOB_DESCRIPTIONS_TOOL_ID = "list_bindable_job_descriptions";

/** 绑定岗位的可选值（编辑页“绑定岗位”下拉框的数据来源）。 */
export type LoadBindableJobDescriptions = () => Promise<SubjectAgentNamedOption[]>;

function createBindableJobsReader(load: LoadBindableJobDescriptions) {
  let jobsPromise: Promise<SubjectAgentNamedOption[]> | null = null;
  return () => {
    jobsPromise ??= load();
    return jobsPromise;
  };
}

function createBindableJobsTool(readJobs: LoadBindableJobDescriptions) {
  return createTool({
    description:
      "读取可绑定的在招岗位（ID 与名称）。页面上下文里的 jobDescriptionIds 是岗位 ID，需要岗位名称或要修改绑定岗位时先调用。",
    execute: async () => ({ jobDescriptions: await readJobs() }),
    id: BINDABLE_JOB_DESCRIPTIONS_TOOL_ID,
    inputSchema: z.object({}),
    outputSchema: z.object({
      jobDescriptions: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  });
}

/** 校验并规范化补丁中的适用范围；有问题时返回拒绝结果。 */
async function resolvePatchJobBinding(
  changes: Partial<SubjectAgentJobBinding>,
  current: SubjectAgentJobBinding | null,
  readJobs: LoadBindableJobDescriptions,
): Promise<{
  binding: Partial<SubjectAgentJobBinding>;
  rejection: SubjectAgentPatchRejection | null;
  resolution: SubjectAgentReferenceResolution;
}> {
  const resolution = createSubjectAgentReferenceResolution();
  const touchesBinding = changes.scope !== undefined || changes.jobDescriptionIds !== undefined;
  const binding = touchesBinding
    ? resolveSubjectAgentJobBinding(changes, current, await readJobs(), resolution)
    : {};
  const rejection =
    resolution.issues.length > 0
      ? { issues: resolution.issues, kind: "patch_rejected" as const }
      : null;
  return { binding, rejection, resolution };
}

const PATCH_REJECTION_HINT = "返回 patch_rejected 时按 issues 修正后重新提出。";
const JOB_BINDING_HINT =
  "作用范围 scope 为 global（全局）或 job_description（指定在招岗位）；绑定岗位使用 list_bindable_job_descriptions 返回的 ID，改为全局时会清空绑定岗位。";

const savedInterviewQuestionSchema = z.object({
  found: z.boolean(),
  template: z
    .object({
      description: z.string().nullable(),
      jobDescriptionIds: z.array(z.string()),
      questions: z.array(
        z.object({
          content: z.string(),
          difficulty: z.string().nullable(),
          evaluationFocus: z.string().nullable(),
          followUpDirections: z.string().nullable(),
          id: z.string(),
        }),
      ),
      scope: z.string(),
      title: z.string(),
    })
    .nullable(),
});

/** 沟通题实体会话工具白名单（ADR-0045）：只读当前沟通题与可绑定岗位、提出表单补丁。 */
export function createInterviewQuestionSubjectTools({
  loadJobDescriptions,
  loadTemplate,
  pageContext,
}: {
  loadJobDescriptions: LoadBindableJobDescriptions;
  loadTemplate: () => Promise<InterviewQuestionTemplateRecord | null>;
  pageContext: InterviewQuestionAgentPageContext | null;
}) {
  const readJobs = createBindableJobsReader(loadJobDescriptions);
  return {
    [BINDABLE_JOB_DESCRIPTIONS_TOOL_ID]: createBindableJobsTool(readJobs),
    get_saved_interview_question_template: createTool({
      description:
        "读取当前沟通题最近一次保存的内容。页面上可能还有未保存的修改，以本轮提供的“当前表单内容”为准。",
      execute: async () => {
        const record = await loadTemplate();
        if (!record) {
          return { found: false, template: null };
        }
        return {
          found: true,
          template: {
            description: record.description ?? null,
            jobDescriptionIds: record.jobDescriptionIds,
            questions: record.questions.map((question) => ({
              content: question.content,
              difficulty: question.difficulty ?? null,
              evaluationFocus: question.evaluationFocus ?? null,
              followUpDirections: question.followUpDirections ?? null,
              id: question.id,
            })),
            scope: record.scope,
            title: record.title,
          },
        };
      },
      id: "get_saved_interview_question_template",
      inputSchema: z.object({}),
      outputSchema: savedInterviewQuestionSchema,
    }),
    [INTERVIEW_QUESTION_PATCH_TOOL_ID]: createTool({
      description: `向成员提出沟通题表单的修改建议。只填写要改的字段；修改题目时给出完整的新题目列表：保留的题目带上原 id，新题省略 id，顺序即展示顺序。${JOB_BINDING_HINT}summary 用一两句中文说明改了什么。${PATCH_REJECTION_HINT}成员应用并保存后才会生效。`,
      execute: async (input: InterviewQuestionAgentPatchInput) => {
        const { binding, rejection, resolution } = await resolvePatchJobBinding(
          input.changes,
          pageContext,
          readJobs,
        );
        if (rejection) {
          return rejection;
        }
        return buildInterviewQuestionAgentPatch(
          { ...input, changes: { ...input.changes, ...binding } },
          pageContext,
          resolution.displayValues,
        );
      },
      id: INTERVIEW_QUESTION_PATCH_TOOL_ID,
      inputSchema: interviewQuestionAgentPatchInputSchema,
      outputSchema: z.union([interviewQuestionAgentPatchSchema, subjectAgentPatchRejectionSchema]),
    }),
  };
}

const savedCandidateFormSchema = z.object({
  found: z.boolean(),
  template: z
    .object({
      description: z.string().nullable(),
      jobDescriptionIds: z.array(z.string()),
      questions: z.array(
        z.object({
          displayMode: z.string(),
          helperText: z.string().nullable(),
          id: z.string(),
          label: z.string(),
          options: z.array(z.object({ label: z.string(), value: z.string() })),
          required: z.boolean(),
          type: z.string(),
        }),
      ),
      scope: z.string(),
      title: z.string(),
    })
    .nullable(),
});

/** 表单题实体会话工具白名单（ADR-0045）：只读当前表单题与可绑定岗位、提出表单补丁。 */
export function createCandidateFormSubjectTools({
  loadJobDescriptions,
  loadTemplate,
  pageContext,
}: {
  loadJobDescriptions: LoadBindableJobDescriptions;
  loadTemplate: () => Promise<CandidateFormTemplateRecord | null>;
  pageContext: CandidateFormAgentPageContext | null;
}) {
  const readJobs = createBindableJobsReader(loadJobDescriptions);
  return {
    [BINDABLE_JOB_DESCRIPTIONS_TOOL_ID]: createBindableJobsTool(readJobs),
    get_saved_candidate_form_template: createTool({
      description:
        "读取当前表单题最近一次保存的内容。页面上可能还有未保存的修改，以本轮提供的“当前表单内容”为准。",
      execute: async () => {
        const record = await loadTemplate();
        if (!record) {
          return { found: false, template: null };
        }
        return {
          found: true,
          template: {
            description: record.description ?? null,
            jobDescriptionIds: record.jobDescriptionIds,
            questions: record.questions.map((question) => ({
              displayMode: question.displayMode,
              helperText: question.helperText ?? null,
              id: question.id,
              label: question.label,
              options: question.options,
              required: question.required,
              type: question.type,
            })),
            scope: record.scope,
            title: record.title,
          },
        };
      },
      id: "get_saved_candidate_form_template",
      inputSchema: z.object({}),
      outputSchema: savedCandidateFormSchema,
    }),
    [CANDIDATE_FORM_PATCH_TOOL_ID]: createTool({
      description: `向成员提出表单题的修改建议。只填写要改的字段；修改题目时给出完整的新题目列表：保留的题目带上原 id，新题省略 id；单选/多选至少 2 个选项且选项值不重复，填写题不设选项；displayMode 需与题型匹配（single: radio/select，multi: checkbox/select，text: input/textarea）。${JOB_BINDING_HINT}summary 用一两句中文说明改了什么。${PATCH_REJECTION_HINT}成员应用并保存后才会生效。`,
      execute: async (input: CandidateFormAgentPatchInput) => {
        const { binding, rejection, resolution } = await resolvePatchJobBinding(
          input.changes,
          pageContext,
          readJobs,
        );
        if (rejection) {
          return rejection;
        }
        return buildCandidateFormAgentPatch(
          { ...input, changes: { ...input.changes, ...binding } },
          pageContext,
          resolution.displayValues,
        );
      },
      id: CANDIDATE_FORM_PATCH_TOOL_ID,
      inputSchema: candidateFormAgentPatchInputSchema,
      outputSchema: z.union([candidateFormAgentPatchSchema, subjectAgentPatchRejectionSchema]),
    }),
  };
}
