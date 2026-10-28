import type { Agent } from "@mastra/core/agent";
import type { ModelMessage } from "ai";
import type { ChatSubjectKind } from "@app/db-schema/chat-subject-threads";
import { loadCandidateFormTemplateById } from "@app/recruiting/forms/queries";
import { loadInterviewQuestionTemplateById } from "@app/recruiting/interview-questions/queries";
import {
  listManagedJobDescriptions,
  loadManagedJobDescriptionById,
} from "@app/resume-processing/review/support/job-descriptions-dao";
import { candidateFormAgentPageContextSchema } from "@app/shared/candidate-form-agent";
import { interviewQuestionAgentPageContextSchema } from "@app/shared/interview-question-agent";
import { jobDescriptionAgentPageContextSchema } from "@app/shared/job-description-agent";
import type { JobDescriptionAgentOptions } from "@app/shared/job-description-agent";
import type { SubjectAgentNamedOption } from "@app/shared/subject-agent-references";
import type { JsonValue } from "@app/shared/stable-stringify";
import type { WorkspaceAuthorizer } from "../../../../access/workspace-access-policy";
import { createJobDescriptionSubjectAgent } from "../../../../agents/mastra/agents/job-description-subject-agent";
import {
  createCandidateFormSubjectAgent,
  createInterviewQuestionSubjectAgent,
} from "../../../../agents/mastra/agents/question-template-subject-agents";
import { describeSubjectPageContext } from "../../../../agents/mastra/agents/subject-agent-instructions";
import { listAllDepartments } from "../../../studio/routes/departments/dao";
import { listAllInterviewers } from "../../../studio/routes/interviewers/dao";
import { listWorkspaceMembers } from "../../../studio/routes/workspace/dao";

/** create 只用于新建页的草稿会话（ADR-0045）。 */
export type SubjectThreadAccess = "create" | "delete" | "edit" | "view";

export interface SubjectThreadAgentSetup {
  agent: Agent;
  /** Unsaved page state appended to this turn's model input; never persisted. */
  contextMessage: ModelMessage | null;
}

export interface SubjectAgentInput {
  organizationId: string;
  pageContext: JsonValue | null;
  /** 草稿会话尚无记录，为 null。 */
  recordId: string | null;
}

export interface SubjectDefinition {
  /** 每个访问级别对应的工作区权限（ADR-0045：访问跟随记录）。 */
  authorize: Record<SubjectThreadAccess, (authorize: WorkspaceAuthorizer) => Promise<boolean>>;
  createAgent: (input: SubjectAgentInput) => SubjectThreadAgentSetup;
  exists: (organizationId: string, recordId: string) => Promise<boolean>;
}

// 引用字段的可选值与对应编辑页下拉框的数据来源一致（ADR-0045）。
async function loadJobDescriptionOptions(
  organizationId: string,
): Promise<JobDescriptionAgentOptions> {
  const [departments, interviewers, members] = await Promise.all([
    listAllDepartments(organizationId),
    listAllInterviewers(organizationId),
    listWorkspaceMembers(organizationId),
  ]);
  return {
    departments: departments.map(({ id, name }) => ({ id, name })),
    interviewers: interviewers.map(({ departmentId, id, name }) => ({ departmentId, id, name })),
    members: members.map(({ id, name }) => ({ id, name })),
  };
}

async function loadBindableJobDescriptions(
  organizationId: string,
): Promise<SubjectAgentNamedOption[]> {
  const records = await listManagedJobDescriptions(organizationId);
  return records.map(({ id, name }) => ({ id, name }));
}

function contextMessage(pageContext: JsonValue | null): ModelMessage | null {
  return pageContext === null
    ? null
    : { content: describeSubjectPageContext(pageContext), role: "system" };
}

export const subjectDefinitions = {
  candidate_form_template: {
    authorize: {
      create: (authorize) => authorize({ action: "create", resource: "candidateForm" }),
      delete: (authorize) => authorize({ action: "delete", resource: "candidateForm" }),
      edit: (authorize) => authorize({ action: "update", resource: "candidateForm" }),
      view: (authorize) => authorize({ action: "read", resource: "candidateForm" }),
    },
    createAgent: ({ organizationId, pageContext, recordId }) => {
      const parsed = candidateFormAgentPageContextSchema.safeParse(pageContext);
      const context = parsed.success ? parsed.data : null;
      return {
        agent: createCandidateFormSubjectAgent({
          loadJobDescriptions: () => loadBindableJobDescriptions(organizationId),
          loadTemplate: () =>
            recordId
              ? loadCandidateFormTemplateById(organizationId, recordId)
              : Promise.resolve(null),
          pageContext: context,
        }),
        contextMessage: contextMessage(context),
      };
    },
    exists: async (organizationId, recordId) =>
      (await loadCandidateFormTemplateById(organizationId, recordId)) !== null,
  },
  interview_question_template: {
    authorize: {
      create: (authorize) => authorize({ action: "create", resource: "questionTemplate" }),
      delete: (authorize) => authorize({ action: "delete", resource: "questionTemplate" }),
      edit: (authorize) => authorize({ action: "update", resource: "questionTemplate" }),
      view: (authorize) => authorize({ action: "read", resource: "questionTemplate" }),
    },
    createAgent: ({ organizationId, pageContext, recordId }) => {
      const parsed = interviewQuestionAgentPageContextSchema.safeParse(pageContext);
      const context = parsed.success ? parsed.data : null;
      return {
        agent: createInterviewQuestionSubjectAgent({
          loadJobDescriptions: () => loadBindableJobDescriptions(organizationId),
          loadTemplate: () =>
            recordId
              ? loadInterviewQuestionTemplateById(organizationId, recordId)
              : Promise.resolve(null),
          pageContext: context,
        }),
        contextMessage: contextMessage(context),
      };
    },
    exists: async (organizationId, recordId) =>
      (await loadInterviewQuestionTemplateById(organizationId, recordId)) !== null,
  },
  job_description: {
    authorize: {
      create: (authorize) => authorize({ action: "create", resource: "jd" }),
      delete: (authorize) => authorize({ action: "delete", resource: "jd" }),
      edit: (authorize) => authorize({ action: "update", resource: "jd" }),
      view: (authorize) => authorize({ action: "read", resource: "jd" }),
    },
    createAgent: ({ organizationId, pageContext, recordId }) => {
      const parsed = jobDescriptionAgentPageContextSchema.safeParse(pageContext);
      const context = parsed.success ? parsed.data : null;
      return {
        agent: createJobDescriptionSubjectAgent({
          loadJobDescription: () =>
            recordId
              ? loadManagedJobDescriptionById(organizationId, recordId)
              : Promise.resolve(null),
          loadOptions: () => loadJobDescriptionOptions(organizationId),
          pageContext: context,
        }),
        contextMessage: contextMessage(context),
      };
    },
    exists: async (organizationId, recordId) =>
      (await loadManagedJobDescriptionById(organizationId, recordId)) !== null,
  },
} satisfies Record<ChatSubjectKind, SubjectDefinition>;
