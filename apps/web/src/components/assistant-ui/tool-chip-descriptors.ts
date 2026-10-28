import type { ToolCallMessagePart } from "@assistant-ui/react";
import { z } from "zod";
import {
  candidateFormAgentFieldLabels,
  candidateFormAgentFields,
  candidateFormAgentPatchSchema,
} from "@app/shared/candidate-form-agent";
import {
  interviewQuestionAgentFieldLabels,
  interviewQuestionAgentFields,
  interviewQuestionAgentPatchSchema,
} from "@app/shared/interview-question-agent";
import {
  jobDescriptionAgentFieldLabels,
  jobDescriptionAgentFields,
  jobDescriptionAgentPatchSchema,
} from "@app/shared/job-description-agent";
import { subjectAgentPatchRejectionSchema } from "@app/shared/subject-agent-references";

/** 工具调用条的图标类别。 */
export type ToolChipIcon = "action" | "edit" | "list" | "read" | "search" | "tool";

/** 调用结果的语气：warning 表示工具正常返回但请求未被接受（如补丁未通过校验）。 */
export type ToolChipTone = "default" | "warning";

export interface ToolChipDescription {
  /** 展开后显示的明细，每行一条；为空时不可展开。 */
  detail: string[];
  icon: ToolChipIcon;
  label: string;
  /** 动作后面的小标签，概括参数或结果；为空时不显示。 */
  summary: string;
  tone: ToolChipTone;
}

type ToolCallPart = Pick<ToolCallMessagePart, "args" | "result" | "toolName">;

const DETAIL_LIMIT = 8;

const querySchema = z.object({ query: z.string() }).partial();
const idsSchema = z.object({ ids: z.array(z.string()) }).partial();
const requestsSchema = z.object({ requests: z.array(z.object({ id: z.string() })) }).partial();
const namedListSchema = z.array(z.object({ name: z.string() }));
const titledRecordSchema = z.object({
  found: z.boolean(),
  jobDescription: z.object({ name: z.string() }).nullable().optional(),
  template: z.object({ title: z.string() }).nullable().optional(),
});
const jobOptionsSchema = z.object({
  departments: namedListSchema,
  interviewers: namedListSchema,
  members: namedListSchema,
});
const bindableJobsSchema = z.object({ jobDescriptions: namedListSchema });
const candidateSearchSchema = z.object({
  candidateSummaryCards: z.array(z.object({ candidateName: z.string() })),
  total: z.number(),
});
const jobSearchSchema = z.object({ jobDescriptions: namedListSchema });
const citationsSchema = z.object({ citations: z.array(z.object({ label: z.string() })) });
const actionProposalSchema = z.object({ title: z.string() });

function describe(
  icon: ToolChipIcon,
  label: string,
  summary = "",
  detail: string[] = [],
  tone: ToolChipTone = "default",
): ToolChipDescription {
  return { detail: detail.slice(0, DETAIL_LIMIT), icon, label, summary, tone };
}

function names(list: { name: string }[]): string[] {
  return list.map((item) => item.name);
}

function describeSavedRecord(part: ToolCallPart, label: string): ToolChipDescription {
  const parsed = titledRecordSchema.safeParse(part.result);
  if (!parsed.success) {
    return describe("read", label);
  }
  const title = parsed.data.jobDescription?.name ?? parsed.data.template?.title;
  return describe("read", label, parsed.data.found ? (title ?? "") : "尚未保存");
}

/** 补丁结果：被拒绝时给出原因，成功时列出修改的字段。 */
function describePatch(
  part: ToolCallPart,
  changedLabels: (result: ToolCallPart["result"]) => string[] | null,
): ToolChipDescription {
  const rejection = subjectAgentPatchRejectionSchema.safeParse(part.result);
  if (rejection.success) {
    return describe("edit", "提出修改建议", "未通过校验", rejection.data.issues, "warning");
  }
  const labels = changedLabels(part.result);
  return describe("edit", "提出修改建议", labels ? labels.join("、") : "");
}

const subjectToolDescribers = {
  get_saved_candidate_form_template: (part) => describeSavedRecord(part, "读取已保存的表单题"),
  get_saved_interview_question_template: (part) => describeSavedRecord(part, "读取已保存的沟通题"),
  get_saved_job_description: (part) => describeSavedRecord(part, "读取已保存的岗位"),
  list_bindable_job_descriptions: (part) => {
    const parsed = bindableJobsSchema.safeParse(part.result);
    return parsed.success
      ? describe(
          "list",
          "读取可绑定岗位",
          `${parsed.data.jobDescriptions.length} 个岗位`,
          names(parsed.data.jobDescriptions),
        )
      : describe("list", "读取可绑定岗位");
  },
  list_job_description_options: (part) => {
    const parsed = jobOptionsSchema.safeParse(part.result);
    if (!parsed.success) {
      return describe("list", "读取岗位选项");
    }
    const { departments, interviewers, members } = parsed.data;
    return describe(
      "list",
      "读取岗位选项",
      `${departments.length} 个部门 · ${interviewers.length} 位面试官 · ${members.length} 位成员`,
      [
        `部门：${names(departments).join("、") || "无"}`,
        `面试官：${names(interviewers).join("、") || "无"}`,
      ],
    );
  },
  propose_candidate_form_patch: (part) =>
    describePatch(part, (result) => {
      const parsed = candidateFormAgentPatchSchema.safeParse(result);
      return parsed.success
        ? candidateFormAgentFields
            .filter((field) => parsed.data.changes[field] !== undefined)
            .map((field) => candidateFormAgentFieldLabels[field])
        : null;
    }),
  propose_interview_question_patch: (part) =>
    describePatch(part, (result) => {
      const parsed = interviewQuestionAgentPatchSchema.safeParse(result);
      return parsed.success
        ? interviewQuestionAgentFields
            .filter((field) => parsed.data.changes[field] !== undefined)
            .map((field) => interviewQuestionAgentFieldLabels[field])
        : null;
    }),
  propose_job_description_patch: (part) =>
    describePatch(part, (result) => {
      const parsed = jobDescriptionAgentPatchSchema.safeParse(result);
      return parsed.success
        ? jobDescriptionAgentFields
            .filter((field) => parsed.data.changes[field] !== undefined)
            .map((field) => jobDescriptionAgentFieldLabels[field])
        : null;
    }),
} satisfies Record<string, (part: ToolCallPart) => ToolChipDescription>;

const copilotToolDescribers = {
  get_job_description_detail: (part) => {
    const ids = idsSchema.safeParse(part.args);
    const citations = citationsSchema.safeParse(part.result);
    return describe(
      "read",
      "读取岗位详情",
      ids.success && ids.data.ids ? `${ids.data.ids.length} 个岗位` : "",
      citations.success ? citations.data.citations.map((citation) => citation.label) : [],
    );
  },
  get_resume_pool_detail: (part) => {
    const requests = requestsSchema.safeParse(part.args);
    return describe(
      "read",
      "读取人才库详情",
      requests.success && requests.data.requests ? `${requests.data.requests.length} 人` : "",
    );
  },
  get_resume_record_detail: (part) => {
    const requests = requestsSchema.safeParse(part.args);
    return describe(
      "read",
      "读取候选人详情",
      requests.success && requests.data.requests ? `${requests.data.requests.length} 人` : "",
    );
  },
  propose_recruiting_action: (part) => {
    const parsed = actionProposalSchema.safeParse(part.result ?? part.args);
    return describe("action", "提出操作建议", parsed.success ? parsed.data.title : "");
  },
  search_job_descriptions: (part) => {
    const query = querySchema.safeParse(part.args);
    const result = jobSearchSchema.safeParse(part.result);
    return describe(
      "search",
      "检索岗位",
      query.success ? (query.data.query ?? "") : "",
      result.success ? names(result.data.jobDescriptions) : [],
    );
  },
  search_resume_records: (part) => {
    const query = querySchema.safeParse(part.args);
    const result = candidateSearchSchema.safeParse(part.result);
    const detail = result.success
      ? [
          `共 ${result.data.total} 人`,
          ...result.data.candidateSummaryCards.map((card) => card.candidateName),
        ]
      : [];
    return describe("search", "检索候选人", query.success ? (query.data.query ?? "") : "", detail);
  },
} satisfies Record<string, (part: ToolCallPart) => ToolChipDescription>;

const toolDescribers = { ...copilotToolDescribers, ...subjectToolDescribers };

function isDescribedTool(toolName: string): toolName is keyof typeof toolDescribers {
  return Object.hasOwn(toolDescribers, toolName);
}

export function describeToolCall(part: ToolCallPart): ToolChipDescription {
  return isDescribedTool(part.toolName)
    ? toolDescribers[part.toolName](part)
    : describe("tool", "调用工具", part.toolName);
}
